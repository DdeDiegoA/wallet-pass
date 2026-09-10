---
titulo: "Setup agéntico — wallet-pass (librería wallet passes)"
fecha: 2026-09-05
estado: propuesta (pendiente revisión agente + aprobación Diego)
slug: wallet-pass (nombre final pendiente, skill `naming`)
---

# Setup Agéntico — wallet-pass

> Librería Node/TypeScript open-source que envuelve un QR existente y emite pases de Apple Wallet + Google Wallet, con ciclo de vida completo. Ver `PRD.md`.

## 1. Ubicación y arranque

| Decisión | Valor | Por qué |
|---|---|---|
| Raíz | `~/Programacion/proyectos/personal/wallet-pass/` | subcarpeta personal; slug TBD |
| Inicialización | **solo `protto init`** | genera la meta-layer agent-friendly (CLAUDE.md/AGENTS.md, `.claude/`, `.opencode/`, `docs/`) |
| Gestor paquetes | **pnpm** (v10 ya instalado) | librería → npm; bun no aporta sobre tsup para `.d.ts`/ESM |
| Build | `tsup` | ESM + `.d.ts` correctos |
| Test | `vitest` | rápido, moderno, std |
| TS | `strict: true`, ESM | |

## 2. Qué genera protto + personalizaciones

Genera: `CLAUDE.md`/`AGENTS.md`, `.claude/` + `.opencode/` (`settings.json`, `agents/`, `commands/`, `rules/`), `docs/` (`architecture/`, `specs/`, `design-system/`, `context.md`, `decisions.md`, `skills.md`), agente `reviewer` + comando `/review`.

Personalizamos después del init:
- **Hooks reales** (protto deja placeholders): `build` → `pnpm run build` (tsup), `test` → `pnpm test` (vitest), `typecheck` → `tsc --noEmit`.
- **Agentes específicos** en `.claude/agents/` + `.opencode/agents/`: un agente `wallet-reviewer` (conoce el dominio wallet: firma pkpass, JWT Google, Web Service Apple) además del `reviewer` genérico.
- **`docs/specs/`** se llena con el spec (speckit) **derivado del PRD**.

## 3. PRD con fases → el seguimiento en `docs/`

El PRD (`PRD.md`) se traduce a una estructura de seguimiento viva:

| PRD (fase) | Vive en `docs/` |
|---|---|
| Fase 0 — Spike (emitir .pkpass + Google con un QR) | `docs/context.md` + entrada en `docs/decisions.md` |
| Fase 1 — Esquema unificado + tipos | `docs/architecture/` + `docs/specs/` (spec.md) |
| Fase 2 — Lifecycle (Apple WS + Google REST) | `docs/architecture/` (endpoints + handlers) |
| Fase 3 — Seguridad | `docs/architecture/` (key mgmt) + `docs/decisions.md` |
| Fase 4 — Publish | `docs/context.md` (estado) + `CHANGELOG` |
| **Fase actual / decisiones** | `docs/context.md` (siempre actualizado) |
| **Log de decisiones (ADR)** | `docs/decisions.md` |

`docs/context.md` = "qué fase estamos + última decisión + próximo paso" — es lo primero que lee cualquier agente al entrar.

## 4. Roster de agentes del vault → mapeado a este proyecto

| Fase | Agente (vault) | Modelo (pool AGENTES.md) | Output |
|---|---|---|---|
| 0 Spike | `engineering-rapid-prototyper` | P6 code → `claude-sonnet-4-6` / `kimi-k2.7-code` | demo emitiendo ambos wallets |
| 1 Esquema | `engineering-software-architect` | P1 → `claude-opus-4-8` / `qwen3.7-max` | DSL + tipos + `docs/architecture` |
| 2 Implementación core | `engineering-backend-architect` + `engineering-senior-developer` | P6 code | `src/` |
| 2b Lifecycle | `engineering-backend-architect` | P1 (lo más delicado) | handlers Apple WS + cliente Google |
| 3 Seguridad | `engineering-software-architect` + `engineering-code-reviewer` | P1 | key mgmt + sanitización |
| 4 Review continuo | `engineering-code-reviewer` | P6 | reviews por PR |
| 4 Tests/validación | `testing-api-tester` + `testing-reality-checker` + `testing-evidence-collector` | P6 | verificar que .pkpass/JWT abren de verdad (no mocks) |
| 5 Docs/publish | `engineering-technical-writer` | P6 no-código | README + guía |

**Agentes del vault SÍ usamos:** los de arriba. **NO usamos:** `design-*` (no hay UI, solo logo/branding mínimo), `engineering-database-optimizer` (sin DB), `engineering-sre`/`devops` (aún no hay deploy).

## 5. Skills mapeadas a este proyecto

| Skill | Uso |
|---|---|
| `protto` | init de la meta-layer |
| `plan` | plan de fases maestro |
| `speckit-specify` / `-plan` / `-tasks` / `-clarify` | spec de la lib a partir del PRD |
| `grill-me` | validar el plan antes de implementar |
| `test-driven-development` | TDD en el core (QR→barcode mapping, lifecycle) |
| `requesting-code-review` | review pre-commit (security/quality gates) |
| `systematic-debugging` | cuando falle firma/opens de wallet |
| `naming` | nombre del paquete + slugs |
| `vault-governance` | capturar decisiones al vault (con tu OK) |
| `coding-agents` | orquestar Claude Code/OpenCode desde Hermes |
| `ponytail` | disciplina de scope (no sobre-construir) |

## 6. Decisiones asumidas (corrígelas si no)

- Toolchain tsup+vitest+strict (no pregunto, std).
- Nombre/slug: pendiente (`naming`); uso `wallet-pass` de placeholder.
- Captura al vault del PRD+setup: pendiente de tu OK y de la carpeta raíz en el vault.

## 7. Próximos pasos (cuando digas "arrancar")

1. `naming` → slug final.
2. `cd personal/ && protto init` (solo esto inicializa).
3. Llenar hooks + `docs/specs` del PRD.
4. Fase 0 Spike con `engineering-rapid-prototyper`.

## 8. Correcciones del revisor (best practices Claude Code/OpenCode)

> Fuentes: code.claude.com/docs (memory, settings, hooks, sub-agents, best-practices, .claude directory) + opencode.ai/docs (rules, agents, config, skills) + blog Anthropic "Steering Claude Code". Citas verbatim [confianza ALTA].

**C1 (ALTA) — Fase 0 es kill-gate, no arranque.** El abogado del diablo ordena validar ANTES de construir. Fase 0 Spike debe ser un go/no-go con criterio de corte (¿hay integradores con pipeline dual + propio + dolor operativo real?), y el resto del tooling/roster queda condicionado a ese gate. No se avanza automáticamente.

**C2 (ALTA) — `docs/context.md` NO se auto-carga.** Claude Code carga solo `CLAUDE.md` (SessionStart, todo la sesión); OpenCode solo `AGENTS.md`. Ninguno lee `docs/` solo. Fix: en `CLAUDE.md` → `@docs/context.md` (Claude expande imports); en `opencode.json` → `"instructions": ["docs/context.md"]`. Si no, la convención "lo primero que lee un agente" es falsa.

**C3 (MEDIA) — las skills listadas son de Hermes, no de Claude/OpenCode.** `speckit-*`, `grill-me`, `naming`, `vault-governance`… viven en Hermes/vault. Claude Code las lee de `.claude/skills/<name>/SKILL.md` (frontmatter `name`+`description`); OpenCode de `.opencode/skills/` o `.claude/skills/` (compat). Clarificar: skills de orquestación las ejecuta Hermes (no viajan a la sesión del agente externo); solo materializar en el repo las que el agente de código necesita on-demand.

**C4 (mejores prácticas Anthropic) — CLAUDE.md corto y con dueño.** <200 líneas, dueño claro, cambios revisados como código. Excluir de CLAUDE.md: info que cambia seguido, API docs detallada, descripción file-by-file. Eso va a skills on-demand o `.claude/rules/<topic>.md` con frontmatter `paths:` (globs) — cargan solo al tocar archivos que matchean.

**C5 (hooks a costo cero) — `PostToolUse` con matcher `Edit|Write`** para correr `pnpm lint`/prettier solo sobre el archivo tocado, sin ensuciar el contexto (vs hook de SessionStart que siempre corre).

**C6 — OpenCode usa dirs plurales** (`agents/`, `commands/`, `skills/`) — consistente con lo que ya genera protto.
