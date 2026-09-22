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

## 2026-09-21-v1-scope-realineado
- **Context**: Auditoría de producto (John/PM) sobre el repo existente v0.1.0 encontró contradicciones entre el PRD/spec (que describían un "ciclo de vida completo" `update/expire/revoke` como si ya fuera v1) y el código real: Apple firma nunca corrió con cert real ni tiene test de firma; `branding.logo` (Buffer) declarado y nunca consumido; sanitización solo quita control chars mientras §9.3 promete anti-XSS; nombre de paquete npm sigue siendo placeholder.
- **Decision**: v1 se formaliza como **"crear pase + darlo por consumido"**, no reescritura del repo. In: (1) emisión real verificada Apple+Google, (2) consumo/redeem dual-tier — Tier A offline siempre, Tier B best-effort (Google `state:completed`, Apple Web Service + 1 push APNs solo para "consumido"), degradando silenciosamente a Tier A si falla red/server, (3) resolver `branding.logo` (endurecer o quitar del API), (4) reconciliar claim de sanitización, (5) publicar npm con nombre final + gate de credenciales. Out (pasa a v2): API de lifecycle orquestada genérica `update/expire/revoke`, push APNs general, HSM/PKCS#11 real (ya decidido fuera antes), tipos boarding/loyalty.
- **Consequences**: `PRD.md` §4 y §8 y `docs/specs/spec.md` §1/§2/§5 actualizados para reflejar v1 vs v2 explícito. El riesgo de mercado (`2026-09-06-gate-override`, riesgos #1/#2 del PRD) **sigue abierto y no se cierra** con este realineamiento. Nuevo gap detectado durante diseño de consumo (Winston, arquitectura): serial/objectId hardcodeado en `apple.ts`/`google.ts` colisiona entre pases — prerequisito bloqueante de implementación, no cambio de alcance.
- **Status**: active
- **Date**: 2026-09-21

## Next Decision Needed
- Nombre final del paquete (PRD §11, decisión abierta #1).
- Apple lifecycle: ¿handler propio delgado o depender de `passkit-webservice-toolkit`/`hapns`? (PRD recomienda handler propio).
