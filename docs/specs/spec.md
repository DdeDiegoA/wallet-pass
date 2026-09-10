---
slug: spec
title: wallet-pass — Specification v1
description: Spec derived from PRD.md for the wallet-pass library.
version: 0.1
status: draft
---

# wallet-pass — Specification v1

## 1. Summary

`wallet-pass` is a Node.js/TypeScript library that takes an existing QR payload from an integrator and emits passes for both Apple Wallet (`.pkpass`) and Google Wallet (JWT save link). It is not a hosted service and does not generate QRs; it wraps the integrator's existing QR infrastructure with a typed, unified DSL and a shared lifecycle (create, update, expire, revoke).

## 2. Functional requirements (v1 scope)

### 2.1 In scope

| ID | Requirement |
|----|-------------|
| R1 | Emit a signed `.pkpass` bundle from an existing QR string + metadata. |
| R2 | Emit a Google Wallet save link (signed JWT) from the same QR string + metadata. |
| R3 | Map and reconcile the QR payload to `barcode` in both Apple and Google formats, with boundary validation and sanitization. |
| R4 | Support pass-level customization: colors, logo, organization name, and fields (header/primary/secondary/auxiliary/back for Apple; class-template and object fields for Google). |
| R5 | Expose a unified lifecycle API: `create`, `update`, `expire`, `revoke`, orchestrating Apple Web Service handlers and Google REST client calls. |
| R6 | Provide an Apple Web Service Protocol handler factory so the integrator can mount the required HTTPS endpoints. |
| R7 | Provide a Google Wallet REST client for update/expire/revoke operations. |
| R8 | Accept credentials (Apple Pass Type ID + WWDR, Google service account) via injection (env/secret/KMS), never hardcoded. |
| R9 | Ship full TypeScript types and ESM output. |

### 2.2 Out of scope (v1)

| ID | Exclusion | Reason |
|----|-----------|--------|
| O1 | Hosted SaaS / multi-tenant backend | Integrator hosts the Web Service endpoints. |
| O2 | NFC, Smart Tap, rotating barcodes, beacons, geo locations | Advanced features; not needed for the cinema demo. |
| O3 | Full boarding-pass / loyalty-point pass types | v1 focuses on `eventTicket` and `generic`. |
| O4 | Native Android SDK / companion app | Google save-link covers web/email/SMS distribution. |

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

// Lifecycle (orchestrates both platforms)
await pass.update({ holder: { seat: "G2" } });
await pass.expire();
await pass.revoke();

// Apple Web Service handler factory
app.post("/wallet/v1/...", pass.appleWebServiceHandler());
```

### 3.1 Design notes

- The `qr` value is the integrator's existing QR payload. The library validates, types, and sanitizes it before mapping to Apple `barcode.message` and Google `barcode.value`.
- Apple barcode format is `PKBarcodeFormatQR` with `messageEncoding: "iso-8859-1"`.
- Google barcode type is `QR_CODE`.
- `appleWebServiceHandler()` returns a request handler that implements the five Apple Web Service endpoints required for push-driven updates.

## 4. Phase 0 acceptance criteria

Phase 0 is a spike / kill-gate. Success is defined by producing a real pass for each platform from the same QR and verifying it opens in both wallets.

| ID | Criterion |
|----|-----------|
| A1 | Generate a real `.pkpass` file using `passkit-generator` with a valid Apple Pass Type ID certificate + WWDR certificate. |
| A2 | Generate a real Google Wallet save link (signed JWT RS256) using a Google Cloud service account. |
| A3 | Both passes encode the **same QR payload** in their barcode fields. |
| A4 | The `.pkpass` opens in Apple Wallet and displays the QR scannable. |
| A5 | The Google link opens the save flow and displays the QR scannable. |

## 5. Lifecycle overview

| Operation | Apple mechanism | Google mechanism |
|-----------|-----------------|------------------|
| Create | Sign `.pkpass`; distribute file/link. | Sign JWT with embedded class+object; return save link. |
| Update | Web Service `GET /v1/passes/...` returns refreshed `.pkpass`; APNs push optional. | `PATCH` class/object via REST; integrator calls Google. |
| Expire | Set `expirationDate` / `relevantDate`; redistribute. | Set `validTimeInterval` and/or `state: EXPIRED`. |
| Revoke | Set `voided: true`; redistribute via Web Service + push. | Set `state: EXPIRED` or delete object; optional save/delete callbacks. |

## 6. Security baseline

- Credentials are injected at runtime; no secrets in source.
- QR payload is sanitized before being copied into any rendered field or barcode value.
- Apple Web Service endpoints validate the `Authorization: ApplePass <authenticationToken>` header.
- Google auth uses least-privilege service accounts; keys are rotatable.

## 7. References

- `PRD.md` — source product requirements.
- `docs/context.md` — current phase and next steps.
- `docs/decisions.md` — architectural decision log.
