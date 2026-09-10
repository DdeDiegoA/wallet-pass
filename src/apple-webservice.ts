// Apple PassKit Web Service protocol (PRD.md §8.2) — pure handlers, no HTTP
// framework attached. The consumer mounts these on Express/Fastify/etc and
// is responsible for parsing the request into the option objects below and
// translating the returned {status, body} into an HTTP response.
// https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
import { timingSafeEqual } from "node:crypto";
import { WalletPass, type WalletPassInput } from "./wallet-pass.js";

const AUTH_PREFIX = "ApplePass ";

/** Extracts the token from an `Authorization: ApplePass <token>` header, or null if malformed/absent. */
export function parseApplePassAuthToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader || !authorizationHeader.startsWith(AUTH_PREFIX)) return null;
  return authorizationHeader.slice(AUTH_PREFIX.length);
}

function isAuthorized(authorizationHeader: string | undefined, expectedAuthToken: string): boolean {
  const token = parseApplePassAuthToken(authorizationHeader);
  if (token === null) return false;
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedAuthToken);
  // timingSafeEqual throws on length mismatch — different lengths are simply invalid, no need to compare further.
  if (tokenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(tokenBuf, expectedBuf);
}

export interface RegistrationRecord {
  deviceLibraryId: string;
  passTypeId: string;
  serial: string;
  pushToken: string;
  updatedAt: number;
}

/**
 * Map-like storage the consumer implements (a real `Map` satisfies this directly).
 * No DB assumed — key registrations by `registrationKey(...)`.
 *
 * SECURITY: `expectedAuthToken` (passed to register/unregister/getSerialsForDevice/getLatestPass)
 * must be a per-device/per-registration secret that the consumer generates and validates —
 * NEVER a single static app-wide token. Scoping by deviceLibraryId+passTypeId+serial is
 * decorative if the same token authorizes every registration (IDOR: any holder of the
 * one token can register/unregister/read any other device's pass).
 */
export interface RegistrationStorage {
  get(key: string): RegistrationRecord | undefined | Promise<RegistrationRecord | undefined>;
  set(key: string, record: RegistrationRecord): unknown;
  delete(key: string): unknown;
  entries(): Iterable<[string, RegistrationRecord]> | Promise<Iterable<[string, RegistrationRecord]>>;
}

export function registrationKey(deviceLibraryId: string, passTypeId: string, serial: string): string {
  return `${deviceLibraryId}:${passTypeId}:${serial}`;
}

export interface RegisterDeviceOptions {
  authorizationHeader: string | undefined;
  expectedAuthToken: string;
  deviceLibraryId: string;
  passTypeId: string;
  serial: string;
  pushToken: string;
  storage: RegistrationStorage;
}

/** POST /v1/devices/{deviceLibraryId}/registrations/{passTypeId}/{serial} */
export async function registerDevice(
  opts: RegisterDeviceOptions,
): Promise<{ status: 401 | 200 | 201 }> {
  if (!isAuthorized(opts.authorizationHeader, opts.expectedAuthToken)) return { status: 401 };
  const key = registrationKey(opts.deviceLibraryId, opts.passTypeId, opts.serial);
  const existing = await opts.storage.get(key);
  await opts.storage.set(key, {
    deviceLibraryId: opts.deviceLibraryId,
    passTypeId: opts.passTypeId,
    serial: opts.serial,
    pushToken: opts.pushToken,
    updatedAt: Date.now(),
  });
  return { status: existing ? 200 : 201 };
}

export interface UnregisterDeviceOptions {
  authorizationHeader: string | undefined;
  expectedAuthToken: string;
  deviceLibraryId: string;
  passTypeId: string;
  serial: string;
  storage: RegistrationStorage;
}

/** DELETE /v1/devices/{deviceLibraryId}/registrations/{passTypeId}/{serial} */
export async function unregisterDevice(
  opts: UnregisterDeviceOptions,
): Promise<{ status: 401 | 200 | 404 }> {
  if (!isAuthorized(opts.authorizationHeader, opts.expectedAuthToken)) return { status: 401 };
  const key = registrationKey(opts.deviceLibraryId, opts.passTypeId, opts.serial);
  const existing = await opts.storage.get(key);
  if (!existing) return { status: 404 };
  await opts.storage.delete(key);
  return { status: 200 };
}

export interface GetSerialsForDeviceOptions {
  authorizationHeader: string | undefined;
  expectedAuthToken: string;
  deviceLibraryId: string;
  passTypeId: string;
  passesUpdatedSince?: Date;
  storage: RegistrationStorage;
}

/** GET /v1/devices/{deviceLibraryId}/registrations/{passTypeId}?passesUpdatedSince= */
export async function getSerialsForDevice(
  opts: GetSerialsForDeviceOptions,
): Promise<{ status: 401 } | { status: 204 } | { status: 200; serialNumbers: string[]; lastUpdated: string }> {
  if (!isAuthorized(opts.authorizationHeader, opts.expectedAuthToken)) return { status: 401 };
  const since = opts.passesUpdatedSince?.getTime() ?? 0;
  const matches: RegistrationRecord[] = [];
  for (const [, record] of await opts.storage.entries()) {
    if (
      record.deviceLibraryId === opts.deviceLibraryId &&
      record.passTypeId === opts.passTypeId &&
      record.updatedAt > since
    ) {
      matches.push(record);
    }
  }
  if (matches.length === 0) return { status: 204 };
  const lastUpdated = Math.max(...matches.map((r) => r.updatedAt));
  return {
    status: 200,
    serialNumbers: matches.map((r) => r.serial),
    lastUpdated: new Date(lastUpdated).toISOString(),
  };
}

export interface GetLatestPassOptions {
  authorizationHeader: string | undefined;
  expectedAuthToken: string;
  passTypeId: string;
  serial: string;
  ifModifiedSince?: Date;
  /** Consumer-supplied: resolves the current pass content + when it last changed, or undefined if unknown. */
  loadPass(
    passTypeId: string,
    serial: string,
  ):
    | Promise<{ input: WalletPassInput; updatedAt: Date } | undefined>
    | ({ input: WalletPassInput; updatedAt: Date } | undefined);
}

/** GET /v1/passes/{passTypeId}/{serial} — null covers 401, 304 (not modified), and 404 (unknown pass). */
export async function getLatestPass(opts: GetLatestPassOptions): Promise<Buffer | null> {
  if (!isAuthorized(opts.authorizationHeader, opts.expectedAuthToken)) return null;
  const record = await opts.loadPass(opts.passTypeId, opts.serial);
  if (!record) return null;
  if (opts.ifModifiedSince && record.updatedAt <= opts.ifModifiedSince) return null;
  return new WalletPass(record.input).apple();
}

/** POST /v1/log — Apple's device-side log endpoint carries no Authorization header (not tied to one pass). */
export function logErrors(
  entries: string[],
  sink: (entries: string[]) => void = (e) => console.error("[apple-webservice] device log:", e),
): void {
  sink(entries);
}
