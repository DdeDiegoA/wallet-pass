# Context

> Current phase, latest decisions, and next steps. Keep it short.

## Fase actual
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
