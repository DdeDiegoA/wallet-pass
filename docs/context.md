# Context

> Current phase, latest decisions, and next steps. Keep it short.

## Fase actual
**v1 código completo (2026-09-21).** Backlog v1 ejecutado y verificado: #1/#1b (serial/issuerId), #2 (consume dual-tier, mergeable tras QA r2: H1 enqueue async-reject, H2 tests outbox-falla, H3 docs EXPIRED→completed), #3 (firma Apple real ejerciada con cert self-signed — test corrió, .pkpass estructuralmente válido), #4 (fan-out APNs + contrato sendPush documentado, arch/index.md:96), #5 (branding.logo removido), #9 (F10 eventName→textModules + guard latin-1). Tests 79→94, typecheck 0. Pendiente solo owner-gated: #6 npm (nombre — wallet-pass tomado en npm; DIFERIDO por Diego) y #8 (credenciales reales Apple+Google). Ver `docs/specs/backlog-v1.md`. Riesgo de mercado (PRD §11) sigue abierto.

**Realineamiento de scope v1 (2026-09-21).** Auditoría de producto encontró que el PRD/spec describían un "ciclo de vida completo" (`update/expire/revoke`) como si ya fuera v1, cuando el código real solo cubre crear+consumir. v1 se formaliza como "crear pase + darlo por consumido" (dual-tier redeem: Tier A offline siempre, Tier B best-effort con degradación silenciosa). `update/expire/revoke` genérico pasa a v2. Ver `docs/decisions.md` → `2026-09-21-v1-scope-realineado` y `PRD.md` §4/§8 (actualizados). Riesgo de mercado sigue abierto, no se cierra con esto.

**Todas las fases del PRD (0-4) cerradas (2026-09-07).** `wallet-pass` v0.1.0: DSL unificado, lifecycle Apple WS + Google REST, seguridad (validación tipada, credenciales explícitas/rotación, audit log), README + demo + CHANGELOG. DoD: 79 tests, exit 0, `pnpm run demo` corre limpio en dry-run (sin credenciales reales en este entorno).

**Post-Fase 4 (2026-09-09):** Ticket rendering HTML. `src/ticket-render.ts` export renderTicketHtml (genera HTML de pase con chips, QR primario/secundarios, sanitización+escape). `WalletPassInputBase` + campo `secondaryQrs?`. Hook SessionEnd wired in settings.json para cleanup.

**Fase 4 — Publish: cerrada.** `demo/emit-demo.ts` (`pnpm run demo`), `CHANGELOG.md` (`[0.1.0]`), `package.json` (keywords/engines/repository-TODO), `README.md`. Post wallet-reviewer (REQUEST CHANGES x2): (1) el README inventaba `pass.update()/.expire()/.revoke()/.appleWebServiceHandler()` — no existen en `WalletPass`; corregido para documentar las funciones reales (`registerDevice`/`getLatestPass` de `apple-webservice.ts`, `upsertEventTicketObject` de `google-lifecycle.ts`). (2) importaba de subpaths inexistentes (`wallet-pass/apple-webservice`) — `package.json` solo exporta `.`; corregido a importar todo desde `wallet-pass`. (3) mismatch de versión `CHANGELOG` 0.1.0 vs `package.json`/`VERSION` 0.0.1 — alineados a 0.1.0.

**Fase 3 — Seguridad: cerrada (2026-09-07).** Validación tipada por passType (falla rápido pre-emisión), credenciales explícitas con prioridad sobre env vars (rotación sin downtime), audit log `onEmit` (solo `serialHash` de 16 hex chars, nunca QR crudo). PKCS#11/HSM real: out of scope v1 (`docs/decisions.md` → `2026-09-07-seguridad-v1-scope`). Post wallet-reviewer: `sanitizeText` aplicado también a `logoText`/`organizationName`/`description` (se habían quedado fuera), `heroImage` validado como URL http(s), `hashSerial` ampliado de 8 a 16 hex chars. DoD: 60 tests, exit 0.

**Fases 0-2:** ver entradas previas en `docs/decisions.md` (spike, DSL unificado + sanitización básica, lifecycle Apple WS + Google REST) — todas cerradas con adversarial review (`wallet-reviewer`) aplicado y DoD verde.

**Nota de gate:** `REVIEW-abogado-del-diablo.md` dio veredicto negativo (irrelevancia de mercado) sobre la premisa dual completa. Diego decidió (2026-09-06) proceder igual con la ejecución completa del PRD por fases — el gate NO se cerró con validación de mercado, se avanza por decisión explícita. Cualquier agente que retome este proyecto debe saber que el riesgo #1/#2 del PRD sigue abierto.

## PRD → docs/ (mapa de seguimiento)

| Fase PRD | Vive en `docs/` |
|---|---|
| Fase 0 — Spike | este archivo + entrada en `docs/decisions.md` |
| Fase 1 — Esquema unificado + tipos | `docs/architecture/` + `docs/specs/spec.md` |
| Fase 2 — Lifecycle (Apple WS + Google REST) | `docs/architecture/` (endpoints + handlers) |
| Fase 3 — Seguridad | `docs/architecture/` (key mgmt) + `docs/decisions.md` |
| Fase 4 — Publish | este archivo (estado) + `CHANGELOG` |

## Latest Decisions
Ver `docs/decisions.md`.

## Next Steps
- [x] Fase 0: spike real (passkit-generator + Google JWT, mismo QR, abre en ambas wallets) — código listo, gate de credenciales pendiente.
- [x] Fase 1: DSL `WalletPass` unificado + tipos + sanitización básica (PRD §6, §9.3 parcial).
- [x] Fase 2: handlers Apple Web Service + cliente Google REST (PRD §8).
- [x] Fase 3: gestión de claves + validación tipada + audit log `onEmit` sin PII (PRD §9). PKCS#11/HSM real: out of scope v1 (decisión `2026-09-07-seguridad-v1-scope`).
- [x] Fase 4: README + demo cine (PRD §10-11). Pendiente para publicar de verdad en npm: nombre final de paquete y URL de repo real (placeholders en `package.json`), y el gate de credenciales reales Apple+Google.
