import { describe, expect, it, vi } from "vitest";
import {
  consumeTierA,
  reflectConsumedTierB,
  hashSerial,
  type ConsumeOutbox,
  type ConsumeOutboxEntry,
  type ConsumeStorage,
} from "./consume.js";
import type { EventTicketObjectClient } from "./google-lifecycle.js";
import type { RegistrationRecord } from "./apple-webservice.js";

/** Reference in-memory ConsumeStorage — the integrator must supply the real atomic one. */
class MemoryConsumeStorage implements ConsumeStorage {
  private readonly consumed = new Set<string>();
  markConsumedIfNew(serial: string): boolean {
    if (this.consumed.has(serial)) return false;
    this.consumed.add(serial);
    return true;
  }
}

describe("consumeTierA (backlog-v1 #2 / #7)", () => {
  it("accepts the first scan of a serial and rejects the second (already-consumed)", async () => {
    const storage = new MemoryConsumeStorage();
    const serial = hashSerial("cinemark|txn=4821|seat=F12");

    expect(await consumeTierA(serial, storage)).toEqual({ status: "accepted" });
    expect(await consumeTierA(serial, storage)).toEqual({ status: "rejected", reason: "already-consumed" });
  });

  it("treats distinct serials as independent", async () => {
    const storage = new MemoryConsumeStorage();
    expect(await consumeTierA("serial-a", storage)).toEqual({ status: "accepted" });
    expect(await consumeTierA("serial-b", storage)).toEqual({ status: "accepted" });
  });
});

describe("reflectConsumedTierB (backlog-v1 #2 / #7)", () => {
  function notFoundError() {
    return Object.assign(new Error("not found"), { code: 404 });
  }

  function fakeGoogleClient(overrides: Partial<EventTicketObjectClient> = {}): EventTicketObjectClient {
    return {
      get: vi.fn().mockRejectedValue(notFoundError()),
      insert: vi.fn().mockResolvedValue({ data: { id: "issuer.obj1" } }),
      patch: vi.fn().mockResolvedValue({ data: { id: "issuer.obj1" } }),
      ...overrides,
    } as unknown as EventTicketObjectClient;
  }

  function registrationFor(serial: string, pushToken: string): Map<string, RegistrationRecord> {
    return new Map([
      [`d1:pass:${serial}`, { deviceLibraryId: "d1", passTypeId: "pass", serial, pushToken, updatedAt: 1 }],
    ]);
  }

  it("completes Google and pushes Apple for the consumed serial", async () => {
    const client = fakeGoogleClient();
    const sendPush = vi.fn().mockResolvedValue(undefined);

    const result = await reflectConsumedTierB({
      serial: "s1",
      google: { client, classId: "issuer.class1", objectId: "issuer.s1" },
      apple: { registrationStorage: registrationFor("s1", "tok-1"), sendPush },
    });

    expect(result).toEqual({ google: "completed", apple: "pushed" });
    expect(client.insert).toHaveBeenCalledWith({
      requestBody: { id: "issuer.s1", classId: "issuer.class1", state: "COMPLETED" },
    });
    expect(sendPush).toHaveBeenCalledWith("tok-1");
  });

  it("skips both legs when neither is configured", async () => {
    expect(await reflectConsumedTierB({ serial: "s1" })).toEqual({ google: "skipped", apple: "skipped" });
  });

  it("never pushes a registration belonging to a different serial", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);
    const result = await reflectConsumedTierB({
      serial: "s1",
      apple: { registrationStorage: registrationFor("other", "tok-x"), sendPush },
    });
    expect(result.apple).toBe("pushed");
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("fans out to every registration of the serial and only that serial", async () => {
    const records: RegistrationRecord[] = [
      { deviceLibraryId: "d1", passTypeId: "pass", serial: "s1", pushToken: "t1", updatedAt: 1 },
      { deviceLibraryId: "d2", passTypeId: "pass", serial: "s1", pushToken: "t2", updatedAt: 2 },
      { deviceLibraryId: "d3", passTypeId: "pass", serial: "s2", pushToken: "t3", updatedAt: 3 },
    ];
    const registrationStorage = new Map(records.map((r) => [`${r.deviceLibraryId}:pass:${r.serial}`, r]));
    const sendPush = vi.fn().mockResolvedValue(undefined);

    const result = await reflectConsumedTierB({
      serial: "s1",
      apple: { registrationStorage, sendPush },
    });

    expect(result.apple).toBe("pushed");
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(sendPush).toHaveBeenCalledWith("t1");
    expect(sendPush).toHaveBeenCalledWith("t2");
    expect(sendPush).not.toHaveBeenCalledWith("t3");
  });

  it("degrades silently on network failure: Tier A stays accepted, the failed leg is enqueued", async () => {
    const storage = new MemoryConsumeStorage();
    const queries: ConsumeOutboxEntry[] = [];
    const outbox: ConsumeOutbox = { enqueue: (entry) => queries.push(entry) };
    const serial = "s1";

    // torniquete: Tier A is the source of truth
    expect(await consumeTierA(serial, storage)).toEqual({ status: "accepted" });

    // Tier B Google dies (500), Apple push dies
    const client = fakeGoogleClient({
      get: vi.fn().mockRejectedValue(Object.assign(new Error("internal error"), { code: 500 })),
    });
    const sendPush = vi.fn().mockRejectedValue(new Error("apns down"));

    const result = await reflectConsumedTierB({
      serial,
      outbox,
      google: { client, classId: "issuer.class1", objectId: "issuer.s1" },
      apple: { registrationStorage: registrationFor(serial, "tok-1"), sendPush },
    });

    expect(result).toEqual({ google: "failed", apple: "failed" });
    expect(queries.map((q) => q.leg).sort()).toEqual(["apple", "google"]);
    expect(queries.every((q) => q.serial === serial && q.attempts === 1 && q.lastError && q.enqueuedAt > 0)).toBe(true);

    // no rollback: the pass is still consumed
    expect(await consumeTierA(serial, storage)).toEqual({ status: "rejected", reason: "already-consumed" });
  });

  it("swallows a synchronous throw from outbox.enqueue", async () => {
    const outbox: ConsumeOutbox = {
      enqueue: () => {
        throw new Error("outbox down");
      },
    };
    const client = fakeGoogleClient({
      get: vi.fn().mockRejectedValue(Object.assign(new Error("internal error"), { code: 500 })),
    });

    const result = await reflectConsumedTierB({
      serial: "s1",
      outbox,
      google: { client, classId: "issuer.class1", objectId: "issuer.s1" },
    });

    expect(result.google).toBe("failed");
  });

  it("attaches a catch to a rejected thenable from outbox.enqueue (no unhandled rejection)", async () => {
    const onUnhandled = vi.fn();
    process.on("unhandledRejection", onUnhandled);
    try {
      const outbox: ConsumeOutbox = { enqueue: () => Promise.reject(new Error("outbox rejected")) };
      const client = fakeGoogleClient({
        get: vi.fn().mockRejectedValue(Object.assign(new Error("internal error"), { code: 500 })),
      });

      const result = await reflectConsumedTierB({
        serial: "s1",
        outbox,
        google: { client, classId: "issuer.class1", objectId: "issuer.s1" },
      });
      expect(result.google).toBe("failed");

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
