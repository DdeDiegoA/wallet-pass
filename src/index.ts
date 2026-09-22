export const VERSION = "0.1.0";

export { renderTicketHtml } from "./ticket-render.js";
export type { TicketQr } from "./ticket-render.js";

export { toAppleBarcode, toGoogleBarcode } from "./qr.js";
export type { AppleBarcode, GoogleBarcode } from "./qr.js";
export { emitApplePassSpike } from "./apple.js";
export type { ApplePassResult, ApplePassField, ApplePassFields, AppleCredentials } from "./apple.js";
export { emitGoogleWalletSpike } from "./google.js";
export type { GoogleWalletResult, GoogleClassFields, GoogleCredentials } from "./google.js";

// Fase 1 — DSL unificado (PRD.md §6/§7).
export { WalletPass, mapToAppleFields, mapToGoogleFields, validateWalletPassInput } from "./wallet-pass.js";
export type {
  WalletPassType,
  WalletPassMeta,
  WalletPassHolder,
  WalletPassBranding,
  WalletPassInput,
  EventTicketMeta,
  WalletPassOptions,
  WalletPassEmitEvent,
} from "./wallet-pass.js";

// Fase 2 — Lifecycle: Apple Web Service protocol + Google REST client (PRD.md §8).
export {
  parseApplePassAuthToken,
  registrationKey,
  registerDevice,
  unregisterDevice,
  getSerialsForDevice,
  getLatestPass,
  logErrors,
} from "./apple-webservice.js";
export type {
  RegistrationRecord,
  RegistrationStorage,
  RegisterDeviceOptions,
  UnregisterDeviceOptions,
  GetSerialsForDeviceOptions,
  GetLatestPassOptions,
} from "./apple-webservice.js";
export {
  createEventTicketObjectClient,
  buildEventTicketObject,
  upsertEventTicketObject,
} from "./google-lifecycle.js";
export type {
  EventTicketObjectClient,
  GoogleLifecycleClientResult,
  EventTicketSeat,
  EventTicketObjectInput,
} from "./google-lifecycle.js";

// v1 — Consumo dual-tier (docs/architecture/index.md "Consumo dual-tier").
export { consumeTierA, reflectConsumedTierB, hashSerial } from "./consume.js";
export type {
  ConsumeStorage,
  ConsumeOutbox,
  ConsumeOutboxEntry,
  ReflectConsumedTierBOptions,
} from "./consume.js";
