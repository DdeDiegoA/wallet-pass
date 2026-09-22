---
slug: spec
title: wallet-pass — Specification v1
description: Spec derived from PRD.md for the wallet-pass library.
version: 0.1
status: draft
---

# wallet-pass — Specification v1

## 1. Summary

`wallet-pass` is a Node.js/TypeScript library that takes an existing QR payload from an integrator and emits passes for both Apple Wallet (`.pkpass`) and Google Wallet (JWT save link). It is not a hosted service and does not generate QRs; it wraps the integrator's existing QR infrastructure with a typed, unified DSL. **v1 scope is "create + consume" (dual-tier redeem), not a full orchestrated lifecycle API** — see §2 (realigned 2026-09-21, `docs/decisions.md` → `2026-09-21-v1-scope-realineado`).

## 2. Functional requirements (v1 scope)

### 2.1 In scope

| ID | Requirement |
|----|-------------|
| R1 | Emit a signed `.pkpass` bundle from an existing QR string + metadata, verified against a real Apple Pass Type ID cert + WWDR (today: code exists, never run with a real cert, no signature test — closing this gap is part of v1). |
| R2 | Emit a Google Wallet save link (signed JWT) from the same QR string + metadata. Already real and tested. |
| R3 | Map and reconcile the QR payload to `barcode` in both Apple and Google formats, with boundary validation and sanitization. |
| R4 | Support pass-level customization: colors, organization name, and fields (header/primary/secondary/auxiliary/back for Apple; class-template and object fields for Google). `branding.logo` (Buffer) is currently declared but never consumed — v1 decides to wire it into real generation or drop it from the API. |
| R5 | **Redeem, dual-tier**: Tier A (offline, always) — validate QR against the integrator's own registry, accept/reject at the door, mark consumed, reject a second scan. Tier B (best-effort, needs network + provider server) — reflect "used" in the wallet: Google `state: "completed"` via REST (`COMPLETED` = redeemed; `EXPIRED` is time-lapse, reserved for v2 — `docs/architecture/index.md:84`); Apple via the existing Web Service handlers + one APNs push scoped only to "consumed". On network/server failure, silently degrade to Tier A. |
| R6 | Provide standalone Apple Web Service functions (`registerDevice`, `unregisterDevice`, `getSerialsForDevice`, `getLatestPass`, `parseApplePassAuthToken`, `logErrors` in `apple-webservice.ts`) so the integrator can wire the required HTTPS endpoints itself — not a handler factory or a method on `WalletPass`. |
| R7 | Provide standalone Google Wallet functions (`createEventTicketObjectClient`, `buildEventTicketObject`, `upsertEventTicketObject` in `google-lifecycle.ts`) for the Tier B `state: "completed"` update — not a general update/expire/revoke client. |
| R8 | Accept credentials (Apple Pass Type ID + WWDR, Google service account) via injection (env/secret/KMS), never hardcoded. |
| R9 | Ship full TypeScript types and ESM output. |
| R10 | Publish to npm under a final package name (today: placeholder) with a real-credentials gate before release. |

### 2.2 Out of scope (v1) — moves to v2

| ID | Exclusion | Reason |
|----|-----------|--------|
| O1 | Generic orchestrated lifecycle API (`update`/`expire`/`revoke` as one surface, `expirationDate`/`relevantDate`/`validTimeInterval` as a business mechanism) | The original PRD described this as v1; the real code only covers create + consume. Documenting it as shipped was the error this realignment corrects. |
| O2 | General-purpose APNs push (beyond the single "consumed" push in R5) | v1 push is scoped to Tier B redeem reflection only. |
| O3 | Hosted SaaS / multi-tenant backend | Integrator hosts the Web Service endpoints. |
| O4 | NFC, Smart Tap, rotating barcodes, beacons, geo locations | Advanced features; not needed for the cinema demo. |
| O5 | Full boarding-pass / loyalty-point pass types | v1 focuses on `eventTicket` and `generic`. |
| O6 | Native Android SDK / companion app | Google save-link covers web/email/SMS distribution. |
| O7 | PKCS#11/HSM real | Already decided out in `docs/decisions.md` → `2026-09-07-seguridad-v1-scope`. |

**Open market risk, not closed by this realignment**: market relevance (PRD §11 risk #1 "just paste the QR", risk #2 single-platform) remains unvalidated; the owner decided to proceed anyway (`docs/decisions.md` → `2026-09-06-gate-override`).

## 3. Proposed API (unified DSL)

```ts
import { WalletPass } from "wallet-pass";

const pass = new WalletPass({
  type: "event-ticket",
  qr: "cinemark|txn=4821|seat=F12|session=2026-09-12T21:30",
  meta: {
    eventName: "Dune: Parte Tres",
    venue: "Cinemark Centro",
    startsAt: new Date("2026-09-12T21:30:00-05:00"),
  },
  holder: { seat: "F12", door: "B" },
  branding: { logo: buffer, backgroundColor: "#000000" },
});

// Create / emit
const applePkpass: Buffer = await pass.apple();
const google: { url: string; jwt: string } = await pass.google();

// Tier B redeem reflection: standalone functions, not methods on WalletPass.
// Apple (apple-webservice.ts) — integrator wires these into its own HTTPS routes:
import { registerDevice, getLatestPass, parseApplePassAuthToken } from "wallet-pass";
// Google (google-lifecycle.ts) — integrator calls this after Tier A confirms consumption:
import { upsertEventTicketObject } from "wallet-pass";

// v2 (out of v1 — do not implement): generic lifecycle surface
// await pass.update({ holder: { seat: "G2" } });
// await pass.expire();
// await pass.revoke();
```

### 3.1 Design notes

- The `qr` value is the integrator's existing QR payload. The library validates, types, and sanitizes it before mapping to Apple `barcode.message` and Google `barcode.value`.
- Apple barcode format is `PKBarcodeFormatQR` with `messageEncoding: "iso-8859-1"`.
- Google barcode type is `QR_CODE`.
- There is no `appleWebServiceHandler()` method and no handler factory. The Apple Web Service Protocol endpoints are implemented as standalone functions in `apple-webservice.ts` (`registerDevice`, `unregisterDevice`, `getSerialsForDevice`, `getLatestPass`, `parseApplePassAuthToken`, `logErrors`); the integrator wires them into its own routes. `WalletPass` itself only exposes `serial`, `apple()`, and `google()`.

## 4. Phase 0 acceptance criteria

Phase 0 is a spike / kill-gate. Success is defined by producing a real pass for each platform from the same QR and verifying it opens in both wallets.

| ID | Criterion |
|----|-----------|
| A1 | Generate a real `.pkpass` file using `passkit-generator` with a valid Apple Pass Type ID certificate + WWDR certificate. |
| A2 | Generate a real Google Wallet save link (signed JWT RS256) using a Google Cloud service account. |
| A3 | Both passes encode the **same QR payload** in their barcode fields. |
| A4 | The `.pkpass` opens in Apple Wallet and displays the QR scannable. |
| A5 | The Google link opens the save flow and displays the QR scannable. |

## 5. Lifecycle overview (v1: create + consume only)

| Operation | Apple mechanism | Google mechanism |
|-----------|-----------------|------------------|
| Create | Sign `.pkpass`; distribute file/link. | Sign JWT with embedded class+object; return save link. |
| Consume — Tier A (offline) | Integrator validates QR against its own registry; no wallet call. | Same. |
| Consume — Tier B (best-effort) | Web Service `GET /v1/passes/...` returns pass marked used; single APNs push scoped to "consumed". | `PATCH` object `state: "completed"` via REST (`EXPIRED` reserved for v2 time-lapse — `docs/architecture/index.md:84`). |

v2 (out of v1): generic `update`/`expire`/`revoke` as one surface, `expirationDate`/`relevantDate`/`validTimeInterval` as a business mechanism, `voided: true` revocation, general APNs push, save/delete callbacks — see §2.2 O1/O2.

## 6. Security baseline

- Credentials are injected at runtime; no secrets in source.
- QR payload is sanitized before being copied into any rendered field or barcode value.
- Apple Web Service endpoints validate the `Authorization: ApplePass <authenticationToken>` header.
- Google auth uses least-privilege service accounts; keys are rotatable.

## 7. References

- `PRD.md` — source product requirements.
- `docs/context.md` — current phase and next steps.
- `docs/decisions.md` — architectural decision log.
