# Backlog v1 — wallet-pass

> Fuente: auditoría de código (2026-09-21) + realineamiento de scope (`docs/decisions.md` → `2026-09-21-v1-scope-realineado`) + diseño de arquitectura (Winston) + producto (John).
> Scope v1 = **crear pase + darlo por consumido**. `update/expire/revoke` genérico → v2.
> Baseline al abrir el backlog: `typecheck` exit 0, **79/79 tests verdes**, `demo` dry-run limpio.

Cada issue trae: **Problema**, **Resolución propuesta (escalable)**, **Archivos**, **Aceptación (DoD)**. Orden = orden de ejecución (dependencias arriba-abajo).

---

## P0 — bloqueante (prerequisito de todo)

### #1 · Serial/objectId único por pase — ✅ DONE (2026-09-21)
> Resuelto por dev (Amelia). `get serial()` (`wallet-pass.ts:183`) = `hashSerial(qr)` canónico, propagado a Apple `serialNumber`, Google `objectId`, audit. typecheck 0, 82 tests (79→82, +3 determinismo). Verificado por wallet-qa (adversarial).
- **Problema:** `apple.ts` y `google.ts` hardcodean el serial (`.pkpass` serialNumber) y el `objectId` de Google a un valor fijo del spike. Todo pase emitido colisiona → no hay multi-ticket, y `consume` (que indexa por serial) es imposible.
- **Resolución (escalable):** derivar el serial de `hashSerial(qr)` (ya existe en `wallet-pass.ts:95`, sha256→16 hex, sin PII). Un solo punto de derivación en la clase `WalletPass`; Apple y Google reciben el mismo serial canónico → los tres formatos (pkpass serialNumber, Google objectId, índice de consume) quedan alineados por construcción. No introduce estado nuevo: el serial es función pura del QR, reproducible offline.
- **Archivos:** `src/wallet-pass.ts` (exponer/propagar serial canónico), `src/apple.ts` (serialNumber ← serial), `src/google.ts` (objectId ← `${issuerId}.${serial}`).
- **Aceptación:** test que emite 2 pases con QR distinto → serials distintos; mismo QR → mismo serial (determinista). typecheck + build verdes.

### #1b · issuerId/classId Google inyectables — en curso (hallazgo QA F8)
- **Problema:** #1 arregló el serial pero `issuerId`/`classId` siguen hardcodeados `"spike-issuer"` (`wallet-pass.ts:204`, `google.ts:53/79`, classId = `${issuerId}.wallet-pass-spike-class`). Multi-emisor roto en producción; el DoD de #1 pasa pero prod no.
- **Resolución (escalable):** inyectar `issuerId` por el DSL (`WalletPassOptions`, junto a `googleCredentials`), fallback a env `GOOGLE_ISSUER_ID`; `classId` derivado del issuerId inyectado. Mismo patrón que #1.
- **Archivos:** `src/wallet-pass.ts`, `src/google.ts`.
- **Aceptación:** test issuerId por DSL sobreescribe default; 82 tests siguen verdes.

---

## P1 — núcleo v1 (crear + consumir)

### #2 · API `consume()` dual-tier — ✅ DONE (2026-09-21, hardening QA-r2 en curso)
> `src/consume.ts` (Amelia): `consumeTierA` + `reflectConsumedTierB` + `ConsumeStorage`/`ConsumeOutbox`, `hashSerial` exportado. F1-F4 implementados. 89 tests (83→89, +6 de #7). Verificado.
> **QA ronda-2 (wallet-qa, 2026-09-21) — RESUELTO:** F1 atómico PASS, F4 PASS, F3 código PASS. Blockers cerrados y verificados: **H1** `enqueue` ahora blinda rechazo async del outbox (Amelia, consume.ts:54-55); **H2** +2 tests outbox-falla sync/async (Amelia, consume.test.ts:119/139) → **91 tests**; **H3** docs barridos EXPIRED→`completed` en consumo, EXPIRED reservado a v2 (John, PRD/spec/brief/decisions). **Mergeable.** Follow-ups no-bloqueantes → #10.
- **Problema:** no existe forma de "dar por consumido" un pase. El torniquete no tiene contra qué validar ni cómo reflejar el uso.
- **Resolución (escalable):** dos funciones puras + interfaces de storage que provee el integrador (la lib **no hostea estado**, igual que hoy con Apple WS):
  ```ts
  consumeTierA(serial, storage: ConsumeStorage):
    Promise<{ status: "accepted" | "rejected", reason?: "already-consumed" }>
    // check-then-set atómico, offline, storage = integrador

  reflectConsumedTierB(opts: {
    serial,
    google?: { client, classId, objectId },              // -> upsert state:"completed"
    apple?:  { registrationStorage, sendPush(pushToken) } // -> push vacío -> device pull getLatestPass
  }): Promise<{ apple?: "pushed"|"skipped"|"failed", google?: "completed"|"failed"|"skipped" }>
  ```
  - **Secuencia:** torniquete → `serial = hashSerial(qr)` → `consumeTierA` (siempre) → si `accepted && online`: `reflectConsumedTierB` fire-and-forget → fallo de red/API = swallow+log, **sin rollback** (Tier A es la fuente de verdad).
  - **Escalabilidad:** Tier A es O(1) por escaneo y offline-capable; Tier B es best-effort desacoplado, se puede paralelizar por-pase sin afectar la puerta. `ConsumeStorage` es la misma forma que `RegistrationStorage` → el integrador reusa su capa.
- **Archivos:** nuevo `src/consume.ts` (ambas funciones + `ConsumeStorage`), reusa `upsertEventTicketObject` (`google-lifecycle.ts`) y `getLatestPass`/`RegistrationStorage` (`apple-webservice.ts`). Export en `src/index.ts`.
- **Endurecimiento pre-implementación (hallazgos QA, Winston rediseña arquitectura antes de codear):**
  - **F1 (bloqueante):** `ConsumeStorage` debe exponer un primitivo **atómico** `markConsumedIfNew(serial)` (true solo si no estaba). Sin atomicidad → doble admisión en race. Integrador lo implementa atómico (unique constraint / SETNX / CAS).
  - **F2:** Tier B no puede ser "swallow+log" puro → **outbox acotado** para reintento del `reflectConsumedTierB` fallido (evita "consumido en puerta pero activo en wallet").
  - **F3 (resuelto):** estado Google de "consumido" = `state:"completed"` (redimido), NUNCA `EXPIRED` (lapso por tiempo, reservado a v2). Ver `docs/architecture/index.md:84`.
  - **F4:** exportar `hashSerial(qr)` como helper público → el torniquete calcula el serial desde el QR sin instanciar `WalletPass`.
- **Aceptación:** ver #7. Bloqueado hasta que Winston cierre F1/F3/F4 (F2 en diseño).

### #3 · Verificar emisión Apple real — ✅ DONE (2026-09-21)
> Amelia: `src/apple.test.ts` genera cert self-signed vía openssl en `beforeAll` (skip explícito si openssl falla), ejerce la rama real `PKPass.from` → assert ZIP magic `PK` + miembros `pass.json`/`manifest.json`/`signature` + barcode best-effort. **Corrió** (no skip), 93 tests. Prueba que la firma ejecuta y emite `.pkpass` válido; validez real ante Apple = #8 (gate credenciales owner). Verificado.

#### (original)
- **Problema:** el path de firma `.pkpass` (`apple.ts`, passkit-generator) **jamás se ejecutó con cert real**; 0 tests de firma. El claim "abre en Apple Wallet" no tiene evidencia.
- **Resolución:** test con cert de prueba (fixture o env de CI) que ejerza la rama real de `emitApplePassSpike` → assert de que el buffer es un ZIP válido con `pass.json` + `manifest.json` + `signature`, y que el barcode contiene el QR. No credenciales de producción en el repo.
- **Archivos:** `src/apple.test.ts` (rama real), fixture de cert de prueba (no commitear key real; usar cert self-signed de test o gate por env).
- **Aceptación:** test de firma real verde en CI; si no hay cert disponible, el test se skippea explícito (no falso verde).

### #4 · APNs push-trigger mínimo (Tier B Apple) — ✅ DONE (2026-09-21)
> #4a (Amelia): test fan-out en consume.test.ts:90 — sendPush llamado 1× por pushToken del serial, 0× para otros serials. #4b (Winston): contrato `sendPush` documentado (arch/index.md:96, cierra H5) — firma 1-arg deliberada (topic/env/pruning = integrador vía closure), NO crece. 94 tests. Verificado.

#### (original)
- **Problema:** sin push, Apple no refresca el pase → Tier B es mudo para Apple.
- **Resolución (mínima, no over-eng):** la lib **no vendorea** cliente APNs. Expone el hook `sendPush(pushToken)` en `reflectConsumedTierB`; el integrador provee el envío (ya tiene credenciales Apple). La lib solo orquesta: por cada registro del serial → llama `sendPush`. Documentar el contrato del push vacío.
- **Archivos:** `src/consume.ts` (contrato `sendPush`), doc en `docs/architecture/`.
- **Aceptación:** test con `sendPush` mock → se invoca una vez por pushToken registrado; fallo de `sendPush` no rompe Tier A.

---

## P2 — deuda / release

### #5 · Remover `branding.logo` (campo muerto) — ✅ DONE (2026-09-21)
> Amelia: `logo?: Buffer` removido de `WalletPassBranding` (wallet-pass.ts). Sin usos. 92 tests. Verificado.

#### (original)
- **Problema:** `WalletPassBranding.logo?: Buffer` declarado pero **nunca consumido** (grep sin usos). API miente.
- **Resolución:** remover el campo del tipo. Consumo real de imagen de logo → v2 (requiere manejo de bundle de imágenes Apple + hosting Google). `logoText` sigue funcionando.
- **Archivos:** `src/wallet-pass.ts` (tipo), tests que referencien el campo.
- **Aceptación:** typecheck verde; grep sin `branding.logo`.

### #6 · Publicación npm — ⏸️ DIFERIDO por owner (2026-09-21)
> Diego: no publicar aún. Hallazgo: `wallet-pass` tomado en npm (v1.0.2 de tercero) → renombrar antes de publicar. repository URL conocida: `github.com/DdeDiegoA/wallet-pass`. Falta decisión de nombre (scoped `@ddediegoa/wallet-pass` o nuevo único) + gate de credenciales (#8). Código listo para publicar salvo nombre.

#### (original)
- **Problema:** `package.json` tiene nombre/repository placeholder; nunca publicado.
- **Resolución:** nombre final de paquete (decisión del owner, pendiente), `repository` URL real, `version` coherente, gate de credenciales reales documentado en README. `npm publish --dry-run` limpio.
- **Archivos:** `package.json`, `README.md`, `CHANGELOG.md`.
- **Aceptación:** `npm publish --dry-run` sin errores; metadata sin placeholders.

### #9 · Menores (hallazgos QA F10 + encoding) — ✅ DONE (2026-09-21)
> Amelia: F10 `eventName` ahora en `textModulesData` header "Event" (google-lifecycle.ts:74), no más `ticketHolderName`. Encoding: `qr.ts:20` guard `/[^\x00-\xFF]/` → throw explícito si no-latin1. 92 tests. Verificado.

#### (original)
- **F10:** `buildEventTicketObject` (`google-lifecycle.ts:77`) mapea `eventName` → `ticketHolderName` (semántica cruzada). Corregir el mapeo de campos.
- **Encoding:** `qr.ts` usa `messageEncoding: "iso-8859-1"` pero `sanitizeText` no fuerza latin-1 → QR con chars no-latin1 se mis-encodea. Validar/forzar latin-1 en el barcode Apple o rechazar payload no representable.
- **Aceptación:** test de mapeo correcto + test de QR no-latin1 (rechazo o encoding correcto).

---

### #10 · Endurecimiento consume (follow-ups QA-r2, no-bloqueante)
- **H4 — serial sin validar (PII):** `consumeTierA`/`reflectConsumedTierB` aceptan cualquier string. Un caller que pase el QR crudo en vez de `hashSerial(qr)` mete PII en storage/outbox. Guard barato: rechazar si no matchea `/^[0-9a-f]{16}$/`. Además `errorMessage(err)` puede volcar cuerpos de error del proveedor al outbox → truncar/sanitizar `lastError`.
- **H5 — contrato `sendPush` incompleto:** falta `passTypeIdentifier` (topic APNs) y `environment` (sandbox/prod); sin poda de tokens muertos → se reintentan cada consumo. Ampliar el contrato del hook. **Se pliega a #4** (APNs push-trigger).
- **H6 (deuda conocida, PASS):** `hashSerial` trunca a 64 bits; comentario `wallet-pass.ts:104` ("distinct QRs never collide") es falso (colisión cumpleaños ~2³²) y sin sal es enumerable para QR de baja entropía. Corregir comentario; sal/ancho → evaluar.
- **H7 (menor):** leg Apple devuelve `"pushed"` con 0 tokens matcheados — `"skipped"` sería más honesto.
- **secondaryQrs no cableado (hallazgo QA README):** `WalletPassInputBase.secondaryQrs` (wallet-pass.ts:46) existe en el input pero `apple()`/`google()` NO lo consumen — solo lo leería `renderTicketHtml` si se llama aparte. Semi-muerto como fue `branding.logo`. Decidir: cablearlo al emit, moverlo a la firma de `renderTicketHtml`, o quitarlo. v2.
- **Aceptación:** guard de serial + test de rechazo; `lastError` acotado; comentario `hashSerial` corregido. H5 dentro del DoD de #4.

## Testing / gate

### #7 · E2E `consume`
- **Resolución:** test end-to-end con storage en memoria: crear pase → escanear (`consumeTierA`) → `accepted`; 2º escaneo del mismo serial → `rejected` reason `already-consumed`. Tier B con mocks Google/Apple → assert `completed`/`pushed`. Fallo de red en Tier B → Tier A sigue `accepted` (degradación silenciosa).
- **Aceptación:** suite verde; cubre accepted/rejected/degradación.

### #8 · Demo real con credenciales (gate no-código)
- **Problema:** único bloqueante real end-to-end: sin credenciales Apple+Google nadie probó "agregar pase".
- **Resolución:** con credenciales reales, `.pkpass` abre en Apple Wallet + link Google guarda; validar barcode escaneable en ambas.
- **Aceptación:** captura/checklist de que ambos pases abren con el QR correcto. **Depende del owner** (credenciales).

---

## Riesgo abierto (no-eng, sigue vivo)
- Relevancia de mercado (PRD §11 #1 "devalúa a pegar QR", #2 "single-platform"). No es issue de build. El owner decidió avanzar igual (2026-09-06). No se cierra con este backlog.

## Sin issue
- **Sanitización/anti-XSS:** verificado sin gap — `ticket-render.ts:12-19` ya escapa HTML; `sanitizeText` es correcto para campos nativos de wallet.
