# wallet-pass
> Node/TS library: wraps an existing QR into Apple Wallet + Google Wallet passes, full lifecycle. See `PRD.md`. Current phase/decisions: `docs/context.md` (also wired via `opencode.json` → `instructions`).

## Herdr team (workspace `w1N`, "wallet-pass")
Recreated 2026-09-21 via hermad — un tab por departamento, un agente por tab. Idle, awaiting tasks.
- Tab **Product** (`w1N:t1`) — `pm-walletpass` (John, PM), pane w1N:p1
  - `orchestrator-walletpass` (claude, model `claude-opus-4-8[1m]`), pane w1N:p5 — added 2026-09-21. Coordinates the wallet-pass team locally (routes to pm/ux/architect/dev, waits on blocked/idle/done); no BMad persona assigned (not a BMad role), briefed directly with a coordinator prompt.
- Tab **Design** (`w1N:t2`) — `ux-walletpass` (Sally, UX), pane w1N:p2
- Tab **Architecture** (`w1N:t3`) — `architect-walletpass` (Winston, Architect), pane w1N:p3
- Tab **Engineering** (`w1N:t4`) — `dev-walletpass` (Amelia, Dev), pane w1N:p4 — swapped 2026-09-21 from claude to `opencode` running `opencode-go/deepseek-v4.1-flash`; re-loaded Amelia persona via `/bmad-agent-dev`.
Workspaces `wH`, `w1K`, `w1M` (old/duplicate) fueron cerrados.
Project status: PRD fases 0-4 cerradas, v0.1.0 publicado. Next work is open-ended — route intent to whichever persona fits.

## Build & Test
- Build: `pnpm run build` (tsup → ESM + `.d.ts`)
- Test: `pnpm test` (vitest)
- Typecheck: `pnpm run typecheck` (`tsc --noEmit`, strict)

## Architecture
- docs/architecture/ — arquitectura + reglas por scope, ver `docs/architecture/index.md`
- .opencode/ — agent configuration

## Gotchas
- `lib/detect.sh` uses POSIX tools (no jq/python). Keep it dependency-free.
- `collect_skills` emits newline-separated names; consume with while-read.
- Backup files use `.bak.<timestamp>`; clean them up before committing.

## Environment
- Required: `bash >= 4.0`
- Optional: `git graphify`

## Available Skills
- Invoke skills with their trigger description. Add personal skills here as needed.
- See `docs/skills.md` for the list detected by protto.

## Docs
- `docs/architecture/` — high-level design and structure
- `docs/specs/` — feature specifications (speckit output)
- `docs/design-system/` — UI/UX and visual direction
- `docs/context.md` — current state and decisions
- `docs/decisions.md` — architectural decision log
- `docs/skills.md` — skills available to this project

## Post-Setup
- Run `protto analyze` to import graphify output or bootstrap it.

## Suggested Post-Setup Workflow

- **`agent-delegation`**: Delega tareas aisladas con agent-delegation
- **`architecture-diagram`**: Diagrama la arquitectura con architecture-diagram
- **`arxiv`**: Busca papers relevantes en arxiv
- **`business-opportunity`**: Valida oportunidad de negocio con business-opportunity
- **`excalidraw`**: Crea wireframes con excalidraw
- **`graphify`**: Genera el knowledge graph del proyecto: ejecuta al inicio y tras cada tarea
- **`grill-me`**: Valida el plan con /grill-me antes de implementar
- **`llm-council`**: Usa llm-council para validar decisiones de arquitectura
- **`naming`**: Usa naming para validar nombres de proyecto/módulos
- **`open-design-integration`**: Integra Open Design para diseño visual iterativo
- **`plan`**: Genera un plan de acción detallado con /plan
- **`proyecto-lean`**: Usa proyecto-lean como orquestador para proyectos multi-fase
- **`requesting-code-review`**: Configura code review pre-commit con requesting-code-review
- **`speckit-clarify`**: Usa /speckit-clarify si el spec tiene ambigüedades
- **`speckit-plan`**: Usa /speckit-plan para generar el plan de implementación
- **`speckit-specify`**: Usa /speckit-specify para crear el spec.md del proyecto
- **`vault-governance`**: Captura decisiones en el vault con vault-governance
- **`youtube-content`**: Investiga contenido relevante en YouTube con youtube-content
