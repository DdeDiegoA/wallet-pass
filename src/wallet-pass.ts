// Unified WalletPass DSL (PRD.md §6/§7). Wraps the Fase 0 spike emitters
// (emitApplePassSpike/emitGoogleWalletSpike) and maps a single input shape
// to each platform's field set.
import { createHash } from "node:crypto";
import { emitApplePassSpike, type ApplePassField, type ApplePassFields, type AppleCredentials } from "./apple.js";
import { emitGoogleWalletSpike, type GoogleClassFields, type GoogleCredentials } from "./google.js";
import { sanitizeText } from "./sanitize.js";
import type { TicketQr } from "./ticket-render.js";

export type WalletPassType = "event-ticket" | "generic";

export interface WalletPassMeta {
  eventName?: string;
  venue?: string;
  startsAt?: Date;
  organizationName?: string;
  description?: string;
  logoText?: string;
  /** URL of the Google Wallet hero image (PRD.md §7 Google). */
  heroImage?: string;
  /** Any other value is rendered as an Apple back field. */
  [key: string]: unknown;
}

export interface WalletPassHolder {
  [key: string]: string | number;
}

export interface WalletPassBranding {
  backgroundColor?: string;
  foregroundColor?: string;
  labelColor?: string;
}

/** event-ticket requires eventName/venue/startsAt (PRD.md §9.3 "validar + tipar en el límite"). */
export interface EventTicketMeta extends WalletPassMeta {
  eventName: string;
  venue: string;
  startsAt: Date;
}

interface WalletPassInputBase {
  qr: string;
  holder?: WalletPassHolder;
  branding?: WalletPassBranding;
  secondaryQrs?: TicketQr[];
}

export type WalletPassInput =
  | (WalletPassInputBase & { type: "event-ticket"; meta: EventTicketMeta })
  | (WalletPassInputBase & { type: "generic"; meta: WalletPassMeta });

/** Audit event emitted after a successful emit (PRD.md §9.2). Never includes the raw QR/serial. */
export interface WalletPassEmitEvent {
  wallet: "apple" | "google";
  passType: WalletPassType;
  serialHash: string;
  timestamp: Date;
}

export interface WalletPassOptions {
  /** Explicit credentials, prioritized over env vars — rotation/multi-tenant without a process restart (PRD.md §9.2). */
  appleCredentials?: AppleCredentials;
  googleCredentials?: GoogleCredentials;
  /**
   * Google Wallet issuer ID (from the Pay & Wallet console). Scopes the saved
   * object's id/class to the real issuer instead of the spike default. Falls
   * back to the GOOGLE_ISSUER_ID env var.
   */
  googleIssuerId?: string;
  onEmit?: (event: WalletPassEmitEvent) => void;
}

const RESERVED_META_KEYS = new Set([
  "eventName",
  "venue",
  "startsAt",
  "organizationName",
  "description",
  "logoText",
  "heroImage",
]);

/** Fails fast with a descriptive error before any emit attempt (PRD.md §9.3). */
export function validateWalletPassInput(input: WalletPassInput): void {
  if (input.type === "event-ticket") {
    const { eventName, venue, startsAt } = input.meta ?? ({} as EventTicketMeta);
    if (typeof eventName !== "string" || eventName.trim() === "") {
      throw new Error("WalletPass: type 'event-ticket' requires meta.eventName (non-empty string)");
    }
    if (typeof venue !== "string" || venue.trim() === "") {
      throw new Error("WalletPass: type 'event-ticket' requires meta.venue (non-empty string)");
    }
    if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
      throw new Error("WalletPass: type 'event-ticket' requires meta.startsAt (valid Date)");
    }
  }
}

/**
 * Canonical serial: first 16 hex chars (64 bits) of sha256(qr) — never the raw
 * QR/serial (PII/sensitive data, PRD.md §9.2). Pure function of the QR, so the
 * same QR always yields the same serial and distinct QRs never collide.
 */
export function hashSerial(qr: string): string {
  return createHash("sha256").update(qr).digest("hex").slice(0, 16);
}

/** Only accept http(s) URLs for heroImage — anything else is dropped, never passed through raw. */
function sanitizeHeroImage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/** Pure mapping: WalletPass input -> Apple pass.json fields (PRD.md §7 Apple). */
export function mapToAppleFields(input: WalletPassInput): ApplePassFields {
  const { meta, holder = {}, branding = {} } = input;

  const headerFields: ApplePassField[] = [];
  if (meta.startsAt) {
    headerFields.push({ key: "startsAt", label: "Date", value: meta.startsAt.toISOString() });
  }

  const primaryFields: ApplePassField[] = [];
  if (meta.eventName) primaryFields.push({ key: "eventName", label: "Event", value: sanitizeText(meta.eventName) });

  const secondaryFields: ApplePassField[] = [];
  if (meta.venue) secondaryFields.push({ key: "venue", label: "Venue", value: sanitizeText(meta.venue) });

  const auxiliaryFields: ApplePassField[] = Object.entries(holder).map(([key, value]) => ({
    key,
    label: key,
    value: sanitizeText(String(value)),
  }));

  const backFields: ApplePassField[] = Object.entries(meta)
    .filter(([key, value]) => !RESERVED_META_KEYS.has(key) && value !== undefined)
    .map(([key, value]) => ({ key, label: key, value: sanitizeText(String(value)) }));

  return {
    headerFields,
    primaryFields,
    secondaryFields,
    auxiliaryFields,
    backFields,
    logoText: meta.logoText ? sanitizeText(meta.logoText) : undefined,
    organizationName: meta.organizationName ? sanitizeText(meta.organizationName) : undefined,
    description: meta.description ? sanitizeText(meta.description) : undefined,
    foregroundColor: branding.foregroundColor,
    backgroundColor: branding.backgroundColor,
    labelColor: branding.labelColor,
  };
}

/** Pure mapping: WalletPass input -> Google class/object fields (PRD.md §7 Google). */
export function mapToGoogleFields(input: WalletPassInput): GoogleClassFields {
  const { meta, branding = {} } = input;
  return {
    issuerName: meta.organizationName ? sanitizeText(meta.organizationName) : undefined,
    eventName: meta.eventName ? sanitizeText(meta.eventName) : undefined,
    venue: meta.venue ? sanitizeText(meta.venue) : undefined,
    dateTimeStart: meta.startsAt?.toISOString(),
    hexBackgroundColor: branding.backgroundColor,
    heroImage: sanitizeHeroImage(meta.heroImage),
  };
}

export class WalletPass {
  constructor(
    private readonly input: WalletPassInput,
    private readonly options: WalletPassOptions = {},
  ) {
    if (!input.qr) throw new Error("qr payload is required");
    validateWalletPassInput(input);
  }

  /**
   * Canonical serial for this pass — the single derivation point shared by every
   * format (Apple serialNumber, Google objectId, consume index). Function of the
   * QR alone: reproducible offline, no state.
   */
  get serial(): string {
    return hashSerial(this.input.qr);
  }

  /** Emits a signed .pkpass buffer. Throws if Apple credentials are missing (spike dry-run). */
  async apple(): Promise<Buffer> {
    const result = await emitApplePassSpike(
      this.input.qr,
      mapToAppleFields(this.input),
      this.options.appleCredentials,
      this.serial,
    );
    if (result.dryRun) throw new Error(`apple() dry-run: ${result.reason}`);
    this.audit("apple");
    return result.pkpass!;
  }

  /** Emits a Google Wallet save link + JWT. Throws if Google credentials are missing (spike dry-run). */
  async google(): Promise<{ url: string; jwt: string }> {
    const result = emitGoogleWalletSpike(
      this.input.qr,
      this.options.googleIssuerId ?? process.env.GOOGLE_ISSUER_ID,
      mapToGoogleFields(this.input),
      this.options.googleCredentials,
      this.serial,
    );
    if (result.dryRun) throw new Error(`google() dry-run: ${result.reason}`);
    this.audit("google");
    return { url: result.url!, jwt: result.jwt! };
  }

  private audit(wallet: "apple" | "google"): void {
    this.options.onEmit?.({
      wallet,
      passType: this.input.type,
      serialHash: this.serial,
      timestamp: new Date(),
    });
  }
}
