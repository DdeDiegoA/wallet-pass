# wallet-pass

Node.js / TypeScript library that wraps an existing QR payload and emits passes for **Apple Wallet** (`.pkpass`) and **Google Wallet** (save link), using a single typed DSL and a shared lifecycle (`create`, `update`, `expire`, `revoke`).

It does **not** generate QRs, host passes, or replace your ticketing backend. It maps your already-generated QR string into the barcode fields and metadata shapes required by each wallet. See the no-goals in [`PRD.md`](./PRD.md) §3 for details.

## Install

```bash
pnpm add wallet-pass
```

## Quickstart

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

// Emit
const applePkpass: Buffer = await pass.apple();
const google: { url: string; jwt: string } = await pass.google();
```

## Lifecycle

There is no `pass.update()` / `.expire()` / `.revoke()` on `WalletPass` — lifecycle is exposed as
standalone functions per platform, not methods on the DSL. Update/expire/revoke are the same
operation on each platform: re-emit (Apple) or patch state (Google).

### Apple — Web Service Protocol

`src/apple-webservice.ts` exports pure handlers (`registerDevice`, `unregisterDevice`,
`getSerialsForDevice`, `getLatestPass`, `logErrors`). They take plain option objects and return
`{ status, ... }` — you mount them on your own HTTP framework and supply a `RegistrationStorage`
(any `Map`-like store: `get`/`set`/`delete`/`entries`) plus a `loadPass` callback that resolves the
current `WalletPassInput` for a serial:

```ts
import { getLatestPass, registerDevice, type RegistrationStorage } from "wallet-pass";

const storage: RegistrationStorage = new Map(); // or your DB-backed implementation

app.post("/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serial", async (req, res) => {
  const result = await registerDevice({
    authorizationHeader: req.headers.authorization,
    expectedAuthToken: await lookupTokenForSerial(req.params.serial), // per-device secret, not app-wide
    deviceLibraryId: req.params.deviceLibraryId,
    passTypeId: req.params.passTypeId,
    serial: req.params.serial,
    pushToken: req.body.pushToken,
    storage,
  });
  res.sendStatus(result.status);
});

app.get("/v1/passes/:passTypeId/:serial", async (req, res) => {
  const pkpass = await getLatestPass({
    authorizationHeader: req.headers.authorization,
    expectedAuthToken: await lookupTokenForSerial(req.params.serial),
    passTypeId: req.params.passTypeId,
    serial: req.params.serial,
    loadPass: (passTypeId, serial) => loadCurrentInput(passTypeId, serial), // your data, updated seat/state = "update"
  });
  if (!pkpass) return res.sendStatus(404);
  res.type("application/vnd.apple.pkpass").send(pkpass);
});
```

To push an update to a registered device, mutate your own pass data and send an APNs silent push —
the device then calls `getLatestPass` above to fetch the new content. "Expire"/"revoke" on Apple
means re-emitting the pass with the field(s) that signal it's no longer valid (e.g. a `voided`
flag in your own data model) — there's no separate expire/revoke endpoint in the protocol.

### Google — EventTicketObject upsert

`src/google-lifecycle.ts` exports `upsertEventTicketObject(client, input)`: it inserts if the
object doesn't exist yet, patches if it does. Update, expire, and revoke are all the same call
with a different `state`:

```ts
import { createEventTicketObjectClient, upsertEventTicketObject } from "wallet-pass";

const { client, dryRun } = createEventTicketObjectClient();
if (!dryRun && client) {
  // update (e.g. seat change)
  await upsertEventTicketObject(client, {
    classId,
    objectId,
    state: "active",
    seat: { seat: "G2" },
  });

  // expire / revoke
  await upsertEventTicketObject(client, { classId, objectId, state: "expired" });
}
```

See [`docs/architecture/index.md`](./docs/architecture/index.md) for the full lifecycle contract and design notes.

## Integrator requirements

| Requirement | Apple | Google |
|-------------|-------|--------|
| Account & credential | Apple Developer Program (~$99/yr) → **Pass Type ID certificate + WWDR** | Google Cloud project → **service account JSON** + registered issuer in Google Pay & Wallet Console |
| Public approval | Automatic once you have a Pass Type ID | **Publishing access** for the issuer (demo mode only issues to test accounts; classes start with `reviewStatus: UNDER_REVIEW`) |
| Hosting | **Yes** — HTTPS endpoint for the Apple Web Service Protocol (the library provides the handler) | Not strictly required for JIT save links; required for updates and optional save/delete callbacks |
| API cost | Included in the Apple Developer Program | Pass issuance is free at the time of writing |

## Security

Credentials are injected at runtime (env vars, secrets, or explicit per-call options); they are never hardcoded. The QR payload is validated and sanitized before being copied into any barcode or rendered field. The Apple Web Service handler validates the `Authorization: ApplePass <authenticationToken>` header.

For the full security model see [`docs/architecture/index.md`](./docs/architecture/index.md) §Seguridad.

## Project state

This is a work-in-progress OSS library. The implementation phases up to security (Fases 0–3) are complete and tested in isolation, but the **end-to-end credential gate remains open**: a real Apple Pass Type ID certificate plus a real Google Cloud service account have not yet been validated together, and the Fase 0 spike runs in dry-run mode.

There is also an unresolved **adversarial market review** that questions the dual-platform premise and the library’s differentiation. Read the full verdict in [`REVIEW-abogado-del-diablo.md`](./REVIEW-abogado-del-diablo.md). Diego decided to proceed with the build despite that verdict; the market risk is intentionally documented, not hidden.

## Run the demo

```bash
pnpm run demo
```

The demo exercises the cinema event-ticket flow end-to-end in the current environment.
