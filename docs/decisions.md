# Decisions Log

## 2026-07-27-baseline
- **Context**: Project wallet-pass initialized with protto.
- **Decision**: Use bash as the primary stack.
- **Consequences**: Build/test commands were detected from existing files.
- **Status**: active
- **Date**: 2026-09-06

## 2026-09-06-toolchain
- **Context**: Fase 0 del PRD necesita compilar y testear. SETUP-agentico.md §1 fija stack std (no se pregunta).
- **Decision**: pnpm + tsup (ESM + `.d.ts`) + vitest + TypeScript `strict: true`.
- **Consequences**: `pnpm run typecheck && pnpm run build && pnpm test` es el comando de validación; hooks de Claude/OpenCode corren estos comandos.
- **Status**: active
- **Date**: 2026-09-06

## 2026-09-06-gate-override
- **Context**: `REVIEW-abogado-del-diablo.md` (abogado-del-diablo, 2026-09-05) dio veredicto negativo: la premisa dual Apple+Google es un script de 50 líneas ya cubierto por demos oficiales y SaaS de ticketing (Spektrix, PassKit, etc.); recomienda entrevistar 10 integradores antes de código o cortar a Google-only.
- **Decision**: Diego decide ejecutar el PRD completo por fases de todos modos, sin validación de mercado previa.
- **Consequences**: riesgo #1 ("script de 50 líneas") y riesgo #2 (mercado single-platform) del PRD quedan abiertos y no mitigados. Fase 0 sigue siendo el punto de re-evaluación más barato si el spike revela fricción no anticipada.
- **Status**: active — override explícito, no revalidado
- **Date**: 2026-09-06

## 2026-09-07-seguridad-v1-scope
- **Context**: Fase 3 (PRD §9.2) pide soporte KMS/HSM: Apple firmando por PKCS#11 sin importar la private key al filesystem, Google alimentando `GoogleAuth` desde un secret manager.
- **Decision**: NO implementar PKCS#11/HSM real en v1. La librería acepta credenciales por env var o explícitas por-llamada (rotación sin downtime, multi-tenant); la integración con KMS/HSM queda como responsabilidad del integrador, que puede inyectar credenciales traídas de su secret manager en runtime.
- **Consequences**: el integrador que necesite HSM debe resolver la firma fuera de la librería (o inyectar material ya desprotegido en memoria). Documentado en `docs/architecture/index.md` → Seguridad (Fase 3). Re-evaluable si aparece demanda real de integradores.
- **Status**: active
- **Date**: 2026-09-07

## Next Decision Needed
- Nombre final del paquete (PRD §11, decisión abierta #1).
- Apple lifecycle: ¿handler propio delgado o depender de `passkit-webservice-toolkit`/`hapns`? (PRD recomienda handler propio).
