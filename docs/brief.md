---
titulo: "Brief — wallet-pass v1"
fecha: 2026-09-21
estado: activo
---

# wallet-pass — Brief v1

## Problema
Un integrador (ej. cine) ya vende online y entrega un QR por email/SMS. El día del evento el usuario no lo encuentra: el QR vive enterrado en un email, no en el bolsillo. Fricción en puerta, no falta de QR.

## Usuario
- **Integrador** (cine/eventos/retail): ya tiene su QR, su infraestructura de venta y su backend de validación en puerta. Necesita que "añadir a wallet" sea trivial encima de lo que ya opera, sin reescribir su sistema de tickets.
- **Usuario final**: compra, recibe el QR, lo guarda en Apple/Google Wallet, lo presenta en puerta.

## Propuesta
`wallet-pass` (librería Node/TS) envuelve el QR que el integrador ya genera y produce un pase para Apple Wallet (`.pkpass`) y Google Wallet (JWT/link), con un DSL tipado unificado. No reimplementa firma ni CRUD (delega en `passkit-generator` / `@googleapis/walletobjects`); su valor es la capa de orquestación: esquema unificado, QR-first, seguridad empaquetada, y el ciclo de "crear + consumir" descrito abajo.

## Scope v1 ("crear pase + darlo por consumido")
1. **Crear**: `.pkpass` + JWT Google desde un QR existente + metadatos, con emisión **real verificada** en ambas plataformas (Apple cierra el hueco de nunca haber corrido con cert real).
2. **Consumir/redeem, dual-tier**:
   - Tier A (offline, siempre): validar QR contra el registro del integrador, aceptar/rechazar en puerta, marcar consumido, rechazar 2º escaneo.
   - Tier B (best-effort, con red + server del proveedor): reflejar "usado" en la wallet — Google `state:completed` (redimido; `EXPIRED` es lapso por tiempo, reservado a v2 — `docs/architecture/index.md:84`), Apple Web Service + 1 push APNs (único push de v1, solo para "consumido"). Falla de red/server → degrada silenciosamente a Tier A.
3. Resolver `branding.logo` (hoy campo muerto): endurecer o quitar del API.
4. Reconciliar sanitización (hoy solo control chars) contra el claim anti-inyección documentado.
5. Publicar en npm con nombre final + gate de credenciales reales.

## No-objetivos (v1) — pasan a v2
- API de lifecycle orquestada genérica (`update`/`expire`/`revoke` como una sola pieza, con `expirationDate`/`relevantDate`/`validTimeInterval` como mecanismo de negocio).
- Push APNs general (fuera del único push de "consumido").
- HSM/PKCS#11 real.
- Tipos boarding pass / loyalty con puntos / transit.
- Servidor hosted / multi-tenant, NFC, smart tap, rotating barcodes, beacons, geo, app Android nativa.

## Riesgo de mercado — abierto, no validado
`REVIEW-abogado-del-diablo.md` (2026-09-05) dio veredicto negativo: la premisa dual Apple+Google podría ser un script de 50 líneas ya cubierto por SaaS de ticketing existentes (riesgo #1), y si el integrador es single-platform el valor dual no aplica (riesgo #2). El owner decidió avanzar sin validar esto con integradores reales (`docs/decisions.md` → `2026-09-06-gate-override`). Este brief y el realineamiento de scope **no cierran** ese riesgo — sigue siendo el punto más barato de re-evaluación si aparece fricción real en el uso de v1.
