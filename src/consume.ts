// Dual-tier redeem (PRD.md §4/§8, docs/architecture/index.md "Consumo dual-tier").
// Pure functions over integrator-supplied storage — the library hosts no state.
// Tier A is the source of truth (offline, atomic); Tier B is best-effort
// reflection to Apple/Google that never throws and never rolls back Tier A.
import { hashSerial } from "./wallet-pass.js";
import { upsertEventTicketObject, type EventTicketObjectClient } from "./google-lifecycle.js";
import type { RegistrationStorage } from "./apple-webservice.js";

export { hashSerial };

/** Atomic check-then-set the integrator owns (UNIQUE + INSERT, Redis SETNX, or CAS). */
export interface ConsumeStorage {
  /** true only the first time this serial is seen; false if already consumed. */
  markConsumedIfNew(serial: string): boolean | Promise<boolean>;
}

export async function consumeTierA(
  serial: string,
  storage: ConsumeStorage,
): Promise<{ status: "accepted" | "rejected"; reason?: "already-consumed" }> {
  const isNew = await storage.markConsumedIfNew(serial);
  return isNew ? { status: "accepted" } : { status: "rejected", reason: "already-consumed" };
}

/** Minimal retry hook the integrator drains with its own worker/cron (not a broker). */
export interface ConsumeOutboxEntry {
  serial: string;
  leg: "google" | "apple";
  attempts: number;
  lastError?: string;
  enqueuedAt: number;
}

export interface ConsumeOutbox {
  enqueue(entry: ConsumeOutboxEntry): unknown;
}

export interface ReflectConsumedTierBOptions {
  serial: string;
  outbox?: ConsumeOutbox;
  google?: { client: EventTicketObjectClient; classId: string; objectId: string };
  apple?: { registrationStorage: RegistrationStorage; sendPush: (pushToken: string) => Promise<void> };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Best-effort: an outbox that itself fails must not surface as a Tier B throw. */
function enqueue(outbox: ConsumeOutbox | undefined, entry: ConsumeOutboxEntry): void {
  if (!outbox) return;
  try {
    const r = outbox.enqueue(entry);
    if (r && typeof (r as { then?: unknown }).then === "function") {
      (r as Promise<unknown>).catch(() => {});
    }
  } catch {
    // swallow — outbox delivery is as best-effort as the reflection it records
  }
}

/**
 * Reflects a consumed pass to the wallets. `state: "completed"` (redeemed), never
 * `"expired"` (time lapse). A leg failure is swallowed, enqueued (if an outbox is
 * given) and reported as `"failed"` — Tier A is the source of truth, no rollback.
 */
export async function reflectConsumedTierB(
  opts: ReflectConsumedTierBOptions,
): Promise<{ google?: "completed" | "failed" | "skipped"; apple?: "pushed" | "failed" | "skipped" }> {
  const result: { google?: "completed" | "failed" | "skipped"; apple?: "pushed" | "failed" | "skipped" } = {};

  if (opts.google) {
    try {
      await upsertEventTicketObject(opts.google.client, {
        classId: opts.google.classId,
        objectId: opts.google.objectId,
        state: "completed",
      });
      result.google = "completed";
    } catch (err) {
      result.google = "failed";
      enqueue(opts.outbox, {
        serial: opts.serial,
        leg: "google",
        attempts: 1,
        lastError: errorMessage(err),
        enqueuedAt: Date.now(),
      });
    }
  } else {
    result.google = "skipped";
  }

  if (opts.apple) {
    try {
      for (const [, record] of await opts.apple.registrationStorage.entries()) {
        if (record.serial === opts.serial) await opts.apple.sendPush(record.pushToken);
      }
      result.apple = "pushed";
    } catch (err) {
      result.apple = "failed";
      enqueue(opts.outbox, {
        serial: opts.serial,
        leg: "apple",
        attempts: 1,
        lastError: errorMessage(err),
        enqueuedAt: Date.now(),
      });
    }
  } else {
    result.apple = "skipped";
  }

  return result;
}
