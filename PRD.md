---
titulo: "PRD — Librería de pases de wallet (QR → Apple Wallet + Google Wallet)"
fecha: 2026-09-05
estado: borrador (pendiente abogado del diablo + aprobación Diego)
version: "0.1"
---

# PRD — Librería que envuelve un QR existente y lo convierte en pase de wallet

## 1. Resumen ejecutivo

Librería **Node.js / TypeScript** (npm/pnpm) que toma un **código QR que el integrador ya genera** (infraestructura propia de ticketing, email, etc.) y produce un pase **guardable en Apple Wallet** (`.pkpass`) y en **Google Wallet**, con **ciclo de vida completo** y **personalización**. Resuelve la fricción de "comprar online → el QR llega por email → el día del evento el usuario no lo encuentra".

**Posicionamiento clave (validado adversarialmente):** NO reimplementar la firma ni el CRUD. Construir un **orquestador delgado y opinado** que depende de librerías existentes (Apple: `passkit-generator`; Google: `@googleapis/walletobjects` + oficial) y es **dueño de la capa que nadie cubre**: esquema unificado → doble emisión, **QR-first** (mapeo/reconciliación del QR ya operado), **máquina de estados de ciclo de vida** con handlers, y **postura de seguridad** empaquetada.

## 2. Problema y oportunidad

**Caso de uso (cine):** un cine vende online, manda el QR por email; el día de la función los usuarios no encuentran el email y se forma fila/descontento. Fricción en puerta, no porque el QR no exista, sino porque vive en un email enterrado.

**Insight central:** el integrador **ya tiene el QR y su entrega** (email/SMS). No necesita que le generemos el QR — necesita que "añadir a wallet" sea trivial **encima** de su infraestructura actual. Esto es un problema de **DX del integrador + adopción del usuario final**, no de generación de códigos.

**Insight técnico (crítico):** Apple Wallet no acepta "push" de actualización — **Apple llama a un endpoint HTTPS que el integrador hostea** (`webServiceURL`). Google sí acepta updates vía REST (el integrador llama a Google). En ambos casos el ciclo de vida exige un **server activo del integrador**. La librería no puede eliminar esa fricción, pero sí **colapsarla a handlers listos**.

## 3. No-objetivos (lo que NO hacemos)

| No hacemos | Por qué |
|-----------|---------|
| Reimplementar la firma `.pkpass` (PKCS#7 + manifest SHA-1 + WWDR) | Resuelto y dominado por `passkit-generator` (~1.18M descargas/mes). Perderíamos. |
| Reimplementar el CRUD + JWT de Google | Resuelto por `@googleapis/walletobjects` + demos oficiales. |
| Hostear/almacenar pases (servicio SaaS) | El integrador ya tiene su infraestructura; no somos un backend hosted. |
| Generar QRs nuevos | El QR ya existe; lo **envolvemos**. |
| Ciclo de vida Apple desde cero | Existe fragmentado en `passkit-webservice-toolkit` + `hapns`; decidimos depender o hacer glue fino. |

## 4. Alcance v1

> **Realineado 2026-09-21** (formalización del repo existente, no reescritura — ver `docs/decisions.md` → `2026-09-21-v1-scope-realineado`). v1 = **"crear pase + darlo por consumido"**, honesto y verificado. El PRD original prometía una API de lifecycle completa (`update/expire/revoke`) como si ya existiera; **eso pasa a v2**. Esta sección reemplaza la anterior.

**In (v1):**
1. **Crear**: `.pkpass` (Apple) + JWT/link Google Wallet a partir de **un QR existente** + metadatos, con **emisión real verificada** en ambas plataformas.
   - Google: ya emite real y probado (79 tests, dry-run limpio).
   - Apple: código de firma existe pero **nunca se ejecutó con certificado real ni tiene test de firma** — v1 cierra ese hueco antes de considerarse completo.
2. **Consumir/redeem** con degradación **dual-tier**:
   - **Tier A (siempre, offline)**: validar el QR contra el registro del integrador → aceptar/rechazar en puerta, marcar consumido, rechazar 2º escaneo.
   - **Tier B (best-effort, con red + server del proveedor)**: reflejar "usado" en la wallet — Google `state: "completed"` vía REST (`COMPLETED` = usado/redimido; `EXPIRED` es lapso por tiempo, reservado a v2 — ver `docs/architecture/index.md:84`); Apple vía los handlers Web Service existentes + **un** push APNs (única pieza de push en v1, solo para "consumido"). Si falla la red o el server del proveedor, degrada silenciosamente a Tier A.
3. **QR-first**: recibir el payload del QR (string) y mapearlo correctamente a `barcode` en ambos formatos, con validación/sanitización en el límite.
4. **Personalización**: colores, campos (header/primary/secondary/auxiliary/back en Apple; class-template vs object fields en Google). `branding.logo` (Buffer): hoy es un campo declarado y **nunca consumido** — v1 decide entre endurecerlo (conectarlo a la generación real) o quitarlo del API si no entra en el corte de v1.
5. **Seguridad empaquetada**: inyección segura de claves/certificados, sin hardcode, credenciales rotables. Sanitización: hoy solo quita control chars; §9.3 promete protección anti-inyección/XSS — v1 reconcilia esa brecha (endurecer sanitización o recortar el claim documentado, no dejarlo contradictorio).
6. **Publicar en npm**: nombre de paquete final (hoy placeholder) + gate de credenciales reales antes de publicar.
7. TypeScript con tipos completos, ESM.

**Out (v1) — pasa a v2:**
- **API de lifecycle orquestada genérica** `update/expire/revoke` como pieza única (existía en el PRD original; el código real solo cubre crear+consumir). Incluye `expirationDate`/`relevantDate`/`validTimeInterval` como mecanismo de negocio.
- Push APNs general (fuera del único push de "consumido" de Tier B).
- PKCS#11/HSM real (ya decidido fuera en `2026-09-07-seguridad-v1-scope`).
- Tipos especializados completos (boarding pass, loyalty con puntos, transit) — v1 se enfoca en **event-ticket (EventTicket)** y **generic**.
- Servidor hosted / multi-tenant.
- NFC, smart tap, rotate barcodes (Google `RotatingBarcode`), beacons, ubicaciones geo — avanzados.
- App Android nativa (SDK) — el link "Add to Wallet" cubre web/email/SMS.

**Riesgo de mercado — permanece abierto, NO se cierra con este realineamiento**: la relevancia de mercado (riesgo #1 "pegar el QR", riesgo #2 single-platform, §11) sigue sin validar. El owner decidió avanzar igual (`docs/decisions.md` → `2026-09-06-gate-override`).

## 5. Arquitectura de alto nivel

```
                   [Integrador: cine/eventos/retail]
                              │  "aquí está mi QR + datos del ticket"
                              ▼
   ┌───────────────────────────────────────────────────────┐
   │   wallet-pass  (esta librería — capa de orquestación)  │
   │                                                        │
   │  1. Esquema unificado "business pass" (DSL tipado)     │
   │  2. QR reconciliación + validación + sanitización      │
   │  3. Máquina de estados lifecycle (create/update/       │
   │     expire/revoke)                                     │
   │  4. Capa de seguridad (keys/certs, rotación)           │
   └───────┬──────────────────────────────┬────────────────┘
           │ Apple                        │ Google
   ┌───────▼────────┐            ┌────────▼─────────────────┐
   │ passkit-       │            │ @googleapis/walletobjects │
   │ generator      │            │ + JWT RS256 (signed)      │
   │ (firma .pkpass)│            │ (CRUD + Add-to-Wallet)    │
   └───────┬────────┘            └────────┬─────────────────┘
           │ .pkpass                      │ JWT / link
           ▼                              ▼
     Apple Wallet                   pay.google.com/gp/v/save/<jwt>
```

**Dependencias propuestas:**
| Dependencia | Rol | Justificación |
|---|---|---|
| `passkit-generator` | Generación + firma `.pkpass` | Dominante, no reinventar |
| `@googleapis/walletobjects` | CRUD Google + auth OAuth2 (service account) | Oficial, tipada |
| `jsonwebtoken` (o `node:crypto`) | Firma JWT RS256 | Estándar |
| **propio** | Esquema unificado + QR reconc. + lifecycle handlers + seguridad | El gap real |

> `ponytail:` si Deeci se cierra solo a Apple o solo a Google más adelante, se puede cortar una rama y usar `passkit-generator`/`@googleapis/walletobjects` directos — el valor muere si el integrador es single-platform (riesgo §11).

## 6. API propuesta (DSL unificado — borrador)

```ts
import { WalletPass } from "wallet-pass";

const pass = new WalletPass({
  type: "event-ticket",
  // QR que el integrador YA genera (el core del "wrap"):
  qr: "cinemark|txn=4821|seat=F12|session=2026-09-12T21:30",
  meta: {
    eventName: "Dune: Parte Tres",
    venue: "Cinemark Centro",
    startsAt: new Date("2026-09-12T21:30:00-05:00"),
  },
  holder: { seat: "F12", door: "B" },
  branding: { logo: buffer, backgroundColor: "#000000" },
});

// Emitir (v1, real)
const applePkpass: Buffer  = await pass.apple();   // .pkpass firmado
const google: { url: string; jwt: string } = await pass.google(); // link add-to-wallet

// Consumo Tier B (v1, real): funciones standalone, NO métodos de WalletPass.
// Apple (apple-webservice.ts) — el integrador monta estas rutas en su server:
import { registerDevice, getLatestPass, parseApplePassAuthToken } from "wallet-pass";
// Google (google-lifecycle.ts) — el integrador la llama tras confirmar Tier A:
import { upsertEventTicketObject } from "wallet-pass";

// v2 (fuera de v1 — NO existe, no implementar así):
// await pass.update({ holder: { seat: "G2" } });
// await pass.expire();
// await pass.revoke();
```

**Notas de diseño:**
- El `qr` string se **valida y mapea**: a Apple `barcode.message` + `messageEncoding: iso-8859-1` y a Google `barcode.value` (`type: QR_CODE`). Si el integrador prefiere, acepta `qr` ya tipado (URL, token, etc.) para aplicar reglas por tipo. **Sanitizar SIEMPRE** el payload crudo antes de volcarlo a campos que se renderizan.
- No existe `pass.appleWebServiceHandler()` ni una factory de handlers. Los endpoints del Apple Web Service Protocol son funciones standalone en `apple-webservice.ts` (`registerDevice`, `unregisterDevice`, `getSerialsForDevice`, `getLatestPass`, `parseApplePassAuthToken`, `logErrors`); el integrador las conecta a sus propias rutas. `WalletPass` solo expone `serial`, `apple()` y `google()`.

## 7. Personalización (Apple + Google, confirmado contra docs)

### Apple (.pkpass)
- **Color**: `foregroundColor`, `backgroundColor`, `labelColor` (rgb hex string).
- **Texto/marca**: `logoText`, `organizationName`, `description`.
- **Campos** (arrays de `{key,label,value}` + `textAlignment`, `changeMessage`): `headerFields`, `primaryFields`, `secondaryFields`, `auxiliaryFields` (frente) y `backFields` (reverso automático ⓘ).
- **Barcode QR**: `{ format: "PKBarcodeFormatQR", message: "<qr>", messageEncoding: "iso-8859-1", altText }`.
- **Imágenes** (files del bundle, no keys del json): `icon.png`, `logo.png`, `strip.png`, `footer.png`, `background.png`, `thumbnail.png` (+ @2x/@3x). Localización opcional en `xx.lproj/`.
- **Tiempo**: `relevantDate`, `expirationDate`.

### Google Wallet
- **Class (plantilla, común)**: `issuerName`, `logo`, `eventName`/`venue` (+ `dateTime.start`), `hexBackgroundColor`, `heroImage`, `reviewStatus` (`UNDER_REVIEW` al crear).
- **Object (instancia por usuario)**: `barcode {type:"QR_CODE", value}`, `seatInfo`, `state`.
- **Generic**: apariencia vive en el **object** — `cardTitle`, `header`, `subheader`, `logo`, `hexBackgroundColor`, `heroImage`, `wideLogo`; contenido: `textModulesData[]`, `linksModuleData`, `messages[]` (máx 10), `validTimeInterval`.
- **Distribución**: link `https://pay.google.com/gp/v/save/<signed_jwt>` embebible en el email existente / SMS / web.

## 8. Ciclo de vida

> **Realineado 2026-09-21**: el PRD original describía un "ciclo de vida completo" (`update/expire/revoke` como API única) como si fuera v1. El código real solo implementa **crear + consumir**; el resto es v2. Esta sección separa explícitamente ambos.

### 8.1 v1 — Creación

- **Apple**: generar `.pkpass` firmado; distribuir como archivo/URL (Safari/Wallet lo importa). **Pendiente de cierre v1**: ejecutar con certificado Pass Type ID + WWDR reales y agregar test de firma — hoy el código nunca corrió contra un cert real.
- **Google**: **just-in-time** (class+object incrustados en el JWT, sin REST previo) o **pre-creada** (class reutilizable por ID + object por usuario); firmar JWT RS256 → link. Ya emite real y probado.

### 8.2 v1 — Consumo (redeem), degradación dual-tier

- **Tier A — offline, siempre disponible**: el integrador valida el QR contra su propio registro (backend/DB del cine) → acepta/rechaza en puerta, marca el pase como consumido localmente, rechaza un segundo escaneo. No depende de Apple ni Google.
- **Tier B — best-effort, requiere red + server del proveedor**: al confirmarse el consumo en Tier A, la librería intenta reflejar "usado" en la wallet:
  - **Google**: `PATCH` a `state: "completed"` vía REST.
  - **Apple**: usa los handlers Web Service **ya existentes** (`GET /v1/passes/...` devuelve el `.pkpass` marcado como usado) + **un único push APNs** para disparar el refresh — esta es la **única pieza de push en v1**, exclusiva para el evento "consumido". No hay push genérico para otros cambios.
  - Si la red o el server del proveedor fallan, Tier B **degrada silenciosamente** a Tier A (el rechazo en puerta ya ocurrió; el reflejo visual en la wallet queda pendiente/no bloqueante).

### 8.3 v2 — Fuera de v1 (lifecycle orquestado genérico)

- **API única `update/expire/revoke`** que traduce a los dos mecanismos dispares de Apple y Google para *cualquier* cambio de campo, no solo "consumido".
- `expirationDate`/`relevantDate` (Apple) y `validTimeInterval` (Google) como mecanismo de negocio de expiración con fecha, más allá del `state: "completed"` de consumo — `state: "EXPIRED"` queda reservado a este flujo de v2, no al consumo.
- `voided: true` (Apple) y callbacks de save/delete (Google) para revocación general (no ligada a consumo).
- Push APNs genérico (más allá del único push de "consumido" de Tier B v1).

> v1 no expone una "API de estado" genérica — expone crear + consumir. El "ciclo de vida orquestado" completo (`update/expire/revoke` como pieza única) es la promesa de v2; documentarlo como si ya existiera en v1 fue el error que este realineamiento corrige.

## 9. Seguridad

### 9.1 Firma (mecánica confirmada)
| Wallets | Secreto crítico | Mecanismo |
|---|---|---|
| **Apple** | Private key del certificado **Pass Type ID** + **WWDR** intermedio | `manifest.json` (SHA-1 de cada archivo) → `signature` = PKCS#7 **detached** sobre manifest. Requisito: Pass Type ID reverse-DNS `pass.*` debe coincidir con el cert. Coste: Apple Developer Program ~$99/año. |
| **Google** | **Service account JSON** (`client_email` + `private_key`) | JWT **RS256** `{iss:client_email, aud:"google", typ:"savetowallet", iat, origins, payload}`. Scope `wallet_object.issuer`. Filtrarla = emitir/alterar pases en tu nombre. |

### 9.2 Gestión de claves (postura de producto, no un README)
- Nunca hardcodear: inyectar por env/secret/contexto.
- Soporte KMS/HSM: Apple idealmente firmar por PKCS#11 (no importar la key al filesystem); Google alimentar `GoogleAuth` en runtime desde secret manager.
- **Least-privilege**: un Pass Type ID / issuer por tenant o grupo funcional (Apple lo diseña así; una fuga no compromete todos los pases).
- **Rotación**: service accounts Google rotables; cert Pass Type Apple renovable anualmente. APIs de la librería para rotar sin downtime.
- **Audit**: log de emisión sin PII; monitoreo de uso anómalo del scope.

### 9.3 Amenazas del dominio
- **Inyección en campos**: el payload crudo del QR (string arbitrario del emisor) NO debe volcarse literal a `barcode.message`, URLs ni `textModules` sin sanear — superficie tipo XSS en el WebView de la wallet. **Validar + tipar + sanitizar en el límite** (esto refuerza "QR-first real", no "pegar bytes").
- **PII mínima**: el pase persiste y viaja offline; no sobrepoblar.
- **Auth del Web Service Apple**: validar `Authorization: ApplePass <token>` por request, HTTPS, no exponer rutas sin auth.

## 10. Requisitos del integrador (lo que el cine necesita tener)

| Requisito | Apple | Google |
|---|---|---|
| Cuenta y credencial | Apple Developer Program (~$99/año) → **Pass Type ID certificate + WWDR** | Proyecto Google Cloud → **service account JSON** + alta de issuer en Google Pay & Wallet console |
| Aprobación para público | Automática al tener Pass Type ID | **"Publishing access"** del issuer (demo mode solo emite a cuentas de prueba; class con `reviewStatus: UNDER_REVIEW`) |
| Hosting | **Sí** — endpoint HTTPS para Web Service Protocol (la lib da el handler) | No estrictamente (link JWT just-in-time), sí para updates/callbacks |
| Coste API | incluido en el programa | emisión de pases gratuita (no verificado desglose; marcar `[medium]`) |

## 11. Riesgos y decisiones abiertas

| # | Riesgo | Mitigación |
|---|--------|-----------|
| 1 | **Devalúa a "pegar el QR en `barcode`"** (script de 50 líneas) | QR-first debe resolver map/validación/reconciliación + reglas por passType. Ese know-how es el valor. |
| 2 | **Mercado single-platform** → el dual no ahorra nada | Validar early con integradores multi-plataforma. Si falla, reposicionar o abandonar. |
| 3 | **Claves mal gestionadas** = pasivo legal | Seguridad first-class (no README), pruebas de rotación. |
| 4 | **Dependency drift** (passkit-webservice-toolkit/hapns son pequeños) | Decidir: depender vs glue propio (decisión abierta abajo). |
| 5 | Competir fronting con passkit-generator en generación | Nunca; delegar lo pesado. |

**Decisiones abiertas (pendiente Diego):**
1. **Nombre del paquete** (preferencia 4-5 letras, abstracto, sin conflicto en npm).
2. **Apple lifecycle**: ¿depender de `passkit-webservice-toolkit`/`hapns` o ser dueño de un handler propio y delgado? (recomiendo: handler propio fino — son 5 endpoints simples, menos superficie de dependencia).
3. **Grado de auto-magic del QR**: ¿detectar/parsear formatos comunes (tokens, URLs, `|`-separated) o aceptar solo string+barcode y dejar el parseo al integrador? (recomiendo v1: string+barcode + un helper opcional de parseo).
4. **Alcance tipos**: ¿v1 = event-ticket + generic, o entrar a boarding/loyalty desde ya?

## 12. Plan MVP (propuesto)

| Fase | Entregable | Validación |
|---|---|---|
| **0. Spike** | Emitir un `.pkpass` real (passkit-generator) + un pase Google (link JWT) con el MISMO QR | Ambos abren en sus wallets con el QR visible y escaneable |
| **1. Esquema unificado** | DSL `WalletPass` → doble salida, tipado TS | test unitario de mapeo QR→barcode en los 2 formatos |
| **2. Lifecycle** | handlers Apple WS + cliente Google (update/expire/revoke) | test de integración: actualizar un pass y ver el cambio reflejado |
| **3. Seguridad** | inyección de keys, sanitización, rotación | escaneo de secrets + test de inyección en campos |
| **4. Publicar** | npm/pnpm + README + demo (cine) | install limpio reproduce el flujo del cine end-to-end |

## 13. Métricas de éxito (librería OSS)

- **Adopción**: installs/semana, issues reales de integradores (no "me gusta").
- **Time-to-first-pass**: un integrador emite su primer pase funcionando en <30 min desde `npm install`.
- **Reducción de fricción** (proxy del dolor): en el caso cine, menor fila / mayor uso del pase en puerta — cualitativo early, no metricas vanidosas.

---

## Fuentes principales (verbatim)

**Apple**
- https://developer.apple.com/wallet/passes/
- https://developer.apple.com/documentation/walletpasses
- https://developer.apple.com/documentation/walletpasses/building_a_pass
- https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html (nota: aún citada por subagente; URL nueva requiere JS)

**Google**
- https://developers.google.com/wallet/generic — Generic pass
- https://developers.google.com/wallet/tickets — Event tickets
- https://developers.google.com/wallet/generic/use-cases/jwt — JWT RS256
- https://developers.google.com/wallet/reference/rest/v1/genericobject — barcode, campos
- https://developers.google.com/wallet/generic/use-cases/updates — update
- https://developers.google.com/wallet/generic/use-cases/expired-passes — expirar
- https://developers.google.com/wallet/generic/use-cases/use-callbacks-for-saves-and-deletions
- https://developers.google.com/wallet/generic/getting-started/issuer-onboarding — demo mode / publishing access
- https://developers.google.com/wallet/generic/getting-started/auth/rest — service account

**Prior art (verificado live 2026-09-05)**
- https://www.npmjs.com/package/passkit-generator (1.18M desc/mes; MIT)
- https://github.com/alexandercerutti/passkit-generator
- https://github.com/alexandercerutti/passkit-webservice-toolkit + https://github.com/alexandercerutti/hapns
- https://github.com/google-wallet/rest-samples (demos oficiales)
- https://github.com/google-wallet/pass-converter (convertidor entre formatos, Google)

> NotebookLM: notebook "Wallet Passes QR — Apple + Google (librería npm)" id `05dc3112-2612-446a-941e-ac7607a4fcb9` (2 deep-research, 8+100 fuentes).
