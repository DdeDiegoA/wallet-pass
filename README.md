# wallet-pass

Node.js / TypeScript library that wraps a QR code your system **already generates** and turns it into a real, scannable pass in **Apple Wallet** (`.pkpass`) and **Google Wallet** (save link) — with the ticket's event data, seat, and branding attached.

It does **not** generate QRs, host passes, or replace your ticketing backend. You keep owning the QR and the "is this ticket valid" decision; this library only handles turning your existing data into a wallet pass and reflecting "used" back to the wallet once you've decided to redeem it. See [`PRD.md`](./PRD.md) §3/§4 for the full scope (v1 vs v2).

> **v1 status (2026-09-21):** the code is complete and tested (94 tests, `typecheck` clean) — create, dual-tier redeem, real Apple signing exercised with a test certificate. Two things are still owner-gated before a real release: the npm package name (`wallet-pass` is taken — **name TODO, see backlog #6**) and real Apple/Google production credentials (**#8**). Everywhere below that says `<package-name>` is a placeholder until that's resolved.

## 1. What it is

`wallet-pass` maps one typed input — an event ticket's QR, event name, venue, date, seat, branding — to both wallet formats at once:

- **Apple**: a signed `.pkpass` file (`PKPass`, via `passkit-generator`).
- **Google**: a signed JWT "Add to Google Wallet" save link.

Same QR, same metadata, two wallets. No lifecycle CRUD API, no hosting — just "create the pass" and "mark it used" (see §6).

## 2. Installation

### (a) From npm (once published)

```bash
pnpm add <package-name>
# or
npm install <package-name>
# or
yarn add <package-name>
```

**Name pending**: `wallet-pass` is already taken on npm. The final package name is deferred (backlog #6) — replace `<package-name>` above with whatever gets picked before you can actually run this.

### (b) From the repository (works today)

Repo URL is the intended remote, pending #6 (`package.json`'s `repository`/`homepage` are still `TODO` — this isn't a verified-public URL yet):

```bash
git clone https://github.com/DdeDiegoA/wallet-pass
cd wallet-pass
pnpm install
pnpm build
```

To consume it from another local project before it's published:

```bash
# in wallet-pass/
pnpm link --global

# in your project
pnpm link --global wallet-pass
```

or reference it directly by path in your project's `package.json`:

```json
{
  "dependencies": {
    "wallet-pass": "file:../wallet-pass"
  }
}
```

Either way, import from the package root — `wallet-pass` only publishes `dist/` and a single entry point (`.`), there are no subpath imports like `wallet-pass/apple`.

## 3. Project setup

Requirements: **Node.js >= 18**, **pnpm**. The library is ESM-only (`"type": "module"` in `package.json`, no CommonJS build).

```bash
pnpm install
pnpm run build       # tsup -> dist/index.js + dist/index.d.ts
pnpm test            # vitest run
pnpm run typecheck   # tsc --noEmit, strict
```

All three should exit `0` before you rely on this in your own project.

## 4. Configure credentials

Both `apple()` and `google()` **throw** if credentials are missing — there's no silent fallback to a demo/sandbox mode.

### Apple

You need an **Apple Developer Program** membership (~$99/year) to get a **Pass Type ID certificate**.

1. Create a Pass Type ID and its certificate in the Apple Developer portal, then export the certificate and its private key.
2. `passkit-generator` (used internally) needs the certificate and key **combined into one PEM file**:
   ```bash
   cat signer.pem signer.key > pass-cert.pem
   ```
3. Download Apple's **WWDR intermediate certificate** (the one matching your Pass Type ID's cert chain).
4. Either set environment variables:
   ```bash
   export APPLE_PASS_CERT=/path/to/pass-cert.pem
   export APPLE_WWDR_CERT=/path/to/wwdr.pem
   export APPLE_PASS_CERT_PASSPHRASE=...   # only if the key is password-protected
   export APPLE_PASS_TYPE_IDENTIFIER=pass.com.yourcompany.tickets
   export APPLE_TEAM_IDENTIFIER=YOUR_TEAM_ID
   ```
   or pass credentials explicitly (takes priority over env vars, useful for rotation/multi-tenant):
   ```ts
   const appleCredentials = {
     cert: await readFile("pass-cert.pem"),   // the combined PEM from step 2
     wwdr: await readFile("wwdr.pem"),
     passphrase: process.env.APPLE_PASS_CERT_PASSPHRASE, // optional
   };
   ```
   Note: `APPLE_PASS_TYPE_IDENTIFIER` and `APPLE_TEAM_IDENTIFIER` are always read from the environment — they aren't part of `appleCredentials` today, so every process sharing one Node runtime shares one Pass Type ID / Team ID even if you rotate `cert`/`wwdr` per call.

### Google

You need a **Google Cloud project** with the **Google Wallet API** enabled and an issuer account in the Google Pay & Wallet Console.

1. Create a **service account** in that project, generate a JSON key, and grant it the issuer's `wallet_object.issuer` scope.
2. Get your **issuer ID** from the Google Pay & Wallet Console.
3. Set:
   ```bash
   export GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"...","private_key":"..."}'
   export GOOGLE_ISSUER_ID=3388000000022...
   export GOOGLE_JWT_ORIGINS=https://your-site.example   # comma-separated allowed origins for the save link
   ```
   or pass it explicitly (priority over the env var):
   ```ts
   const googleCredentials = { serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON! };
   ```

**Never commit these.** The combined Apple PEM and the Google service account JSON are both full signing keys — treat them like passwords (secret manager, `.env` in `.gitignore`, CI secrets), not repo files.

## 5. Your first custom pass

```ts
import { writeFile } from "node:fs/promises";
import { WalletPass, type WalletPassInput, type WalletPassOptions } from "wallet-pass"; // "<package-name>" once renamed

const input: WalletPassInput = {
  type: "event-ticket", // or "generic"
  qr: "cinemark|txn=4821|seat=F12|session=2026-09-12T21:30", // your existing QR payload, unmodified
  meta: {
    // required for "event-ticket":
    eventName: "Dune: Parte Tres",
    venue: "Cinemark Centro",
    startsAt: new Date("2026-09-12T21:30:00-05:00"),
    // optional, all types:
    organizationName: "Cinemark",
    description: "General admission",
    logoText: "Cinemark",
    heroImage: "https://cdn.example.com/dune-hero.jpg", // must be http(s); anything else is dropped
    // any other key here becomes an Apple "back field" (e.g. terms, barcode help text):
    terms: "No refunds after showtime.",
  },
  holder: { seat: "F12", door: "B" }, // rendered as Apple auxiliary fields
  branding: { backgroundColor: "#000000", foregroundColor: "#ffffff", labelColor: "#ffffff" },
};

const options: WalletPassOptions = {
  appleCredentials, // from §4, or omit to use APPLE_* env vars
  googleCredentials, // from §4, or omit to use GOOGLE_SERVICE_ACCOUNT_JSON
  googleIssuerId: process.env.GOOGLE_ISSUER_ID,
  onEmit: (event) => console.log("[audit]", event), // no PII, only serialHash
};

const pass = new WalletPass(input, options);

// Apple: throws if APPLE_PASS_CERT/APPLE_WWDR_CERT (or appleCredentials) are missing.
const pkpass: Buffer = await pass.apple();
await writeFile("ticket.pkpass", pkpass);

// Google: throws if GOOGLE_SERVICE_ACCOUNT_JSON (or googleCredentials) is missing.
const { url, jwt } = await pass.google();
console.log("Add to Google Wallet:", url);
```

Field notes:
- `qr` is required and must be non-empty (`WalletPass` throws otherwise); everything else on the pass is sanitized (control characters stripped) before it reaches a barcode or native field.
- `event-ticket` requires `meta.eventName`, `meta.venue`, and `meta.startsAt` (a real `Date`) — `WalletPass` throws immediately if any are missing, before touching Apple or Google. `generic` has no required `meta` fields.
- `pass.serial` (a getter) is `sha256(qr)` truncated to the first 16 hex chars — deterministic from the QR alone, used as the Apple serial number, the Google object ID suffix, and the redeem index in §6. It never exposes the raw QR.
- `holder` values are rendered as Apple auxiliary fields; keys are free-form (`{ [key: string]: string | number }`).
- `secondaryQrs` (optional, on the input) accepts additional `TicketQr` entries, but `apple()`/`google()` don't consume it — it does nothing to the `.pkpass` or the Google save link. It's only read if you separately call `renderTicketHtml` to render an HTML ticket page with multiple barcodes; out of scope for this Quickstart.

## 6. Redeeming the pass (at the door)

v1 does **not** expose `update()`/`expire()`/`revoke()` — only create (§5) and redeem, dual-tier:

```ts
import { hashSerial, consumeTierA, reflectConsumedTierB } from "wallet-pass";

const serial = hashSerial(qr); // same derivation WalletPass.serial uses internally

// Tier A — offline, always: your own storage is the source of truth.
const result = await consumeTierA(serial, storage); // storage: { markConsumedIfNew(serial) }
if (result.status === "rejected") {
  // already consumed — reject at the door, don't touch the wallets
} else {
  // accepted — reject the second scan; then, best-effort, try Tier B:
  await reflectConsumedTierB({ serial, google, apple, outbox }); // any leg can be omitted/fail silently
}
```

`consumeTierA` is the gate (accept/reject); `reflectConsumedTierB` only tries to make the wallet itself show "used" (Google `state: "completed"`, Apple push + refresh) and never throws or rolls back Tier A if the network or the wallet's servers are unavailable. Full contract, the `ConsumeStorage`/`ConsumeOutbox` shapes, and the Apple push wiring: [`docs/architecture/index.md`](./docs/architecture/index.md) ("Consumo dual-tier" / "sendPush").

## 7. Lifecycle plumbing (Apple Web Service / Google REST)

These are the standalone functions §6's Tier B calls into — you can also wire them directly if you're building your own redeem flow instead of using `consumeTierA`/`reflectConsumedTierB`.

### Apple — Web Service Protocol

`apple-webservice.ts` exports pure handlers (`registerDevice`, `unregisterDevice`, `getSerialsForDevice`, `getLatestPass`, `logErrors`, `parseApplePassAuthToken`) — no HTTP framework attached, no factory. You mount them on your own routes and supply a `RegistrationStorage` (anything with `get`/`set`/`delete`/`entries`, a plain `Map` works):

```ts
import { getLatestPass, registerDevice, type RegistrationStorage } from "wallet-pass";

const storage: RegistrationStorage = new Map();

app.post("/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serial", async (req, res) => {
  const result = await registerDevice({
    authorizationHeader: req.headers.authorization,
    expectedAuthToken: await lookupTokenForSerial(req.params.serial), // per-device secret, never one static token
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
    loadPass: (passTypeId, serial) => loadCurrentInput(passTypeId, serial), // your data -> WalletPassInput
  });
  if (!pkpass) return res.sendStatus(404); // covers 401 (bad auth), 304 (unchanged), 404 (unknown)
  res.type("application/vnd.apple.pkpass").send(pkpass);
});
```

`getLatestPass` re-emits the `.pkpass` internally via `new WalletPass(record.input).apple()`, from whatever `loadPass` returns for that serial — that's the mechanism this endpoint gives you. v1 does **not** implement expiration or revocation on top of it (no flag on the input flips the pass to "voided" or otherwise changes what Apple does with it) — that's v2, see `PRD.md` §8.3.

### Google — EventTicketObject upsert

`google-lifecycle.ts` exports `createEventTicketObjectClient()` (reads `GOOGLE_SERVICE_ACCOUNT_JSON`, returns `{ dryRun, client }`) and `upsertEventTicketObject(client, input)`, which inserts if the object doesn't exist yet or patches if it does:

```ts
import { createEventTicketObjectClient, upsertEventTicketObject } from "wallet-pass";

const { client, dryRun } = createEventTicketObjectClient();
if (!dryRun && client) {
  await upsertEventTicketObject(client, {
    classId,
    objectId,
    state: "completed", // redeemed. "active" | "expired" | "inactive" also exist on the type but are v2 concerns.
  });
}
```

## Integrator requirements

| Requirement | Apple | Google |
|-------------|-------|--------|
| Account & credential | Apple Developer Program (~$99/yr) → **Pass Type ID certificate + WWDR** | Google Cloud project → **service account JSON** + registered issuer in Google Pay & Wallet Console |
| Public approval | Automatic once you have a Pass Type ID | **Publishing access** for the issuer (demo mode only issues to test accounts; classes start with `reviewStatus: UNDER_REVIEW`) |
| Hosting | **Yes** — HTTPS endpoint for the Apple Web Service Protocol (§7 shows the handlers) | Not strictly required for the save-link JWT; required for redeem (§6) |
| API cost | Included in the Apple Developer Program | Pass issuance is free at the time of writing |

## Security

Credentials are injected at runtime (env vars, secrets, or explicit per-call options); they are never hardcoded. Every user-supplied string (event name, venue, holder fields, QR payload) is sanitized before being copied into a barcode or a rendered field. The Apple Web Service handlers validate the `Authorization: ApplePass <authenticationToken>` header with a constant-time comparison. `onEmit`/audit events only ever carry `serialHash` — never the raw QR.

For the full security model and the consume dual-tier design, see [`docs/architecture/index.md`](./docs/architecture/index.md).

## Project state

v1 is code-complete and tested (94 tests, `typecheck` clean): create (Apple + Google, Apple signing exercised end-to-end with a test certificate), dual-tier redeem, and the lifecycle plumbing above. See [`docs/context.md`](./docs/context.md) and [`docs/specs/backlog-v1.md`](./docs/specs/backlog-v1.md) for what shipped.

Two things remain **owner-gated**, not implementation gaps: the final npm package name (`wallet-pass` is taken) and validating real Apple + Google production credentials together (the test suite proves the code paths work; it hasn't run against Apple's/Google's live production infrastructure).

There is also an unresolved **adversarial market review** that questions the dual-platform premise and the library's differentiation — see [`REVIEW-abogado-del-diablo.md`](./REVIEW-abogado-del-diablo.md). Diego decided to proceed despite that verdict; the market risk is intentionally documented, not resolved or hidden (see `docs/decisions.md` → `2026-09-06-gate-override`).

## Run the demo

```bash
pnpm run demo
```

Exercises the cinema event-ticket flow end-to-end (create only) in whatever credential state your environment is in — with no Apple/Google credentials set, `apple()`/`google()` throw a dry-run error by design, and the demo logs `{ dryRun, reason }` instead of crashing.
