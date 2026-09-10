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

**In** (v1):
- Emitir `.pkpass` (Apple) y pase Google Wallet a partir de **un QR existente** + metadatos.
- **QR-first**: recibir el payload del QR (string) y mapearlo correctamente a `barcode` en ambos formatos, con validación/sanitización en el límite.
- **Personalización**: colores, logo, campos (header/primary/secondary/auxiliary/back en Apple; class-template vs object fields en Google).
- **Ciclo de vida completo**: crear, actualizar, expirar, revocar (Apple Web Service Protocol **handlers** + Google REST **cliente**).
- **Seguridad empaquetada**: inyección segura de claves/certificados, sin hardcode, least-privilege, sanitización anti-inyección.
- TypeScript con tipos completos, ESM.

**Out (v1):**
- Servidor hosted / multi-tenant.
- NFC, smart tap, rotate barcodes (Google `RotatingBarcode`), beacons, ubicaciones geo — avanzados.
- Tipos especializados completos (boarding pass, loyalty con puntos, transit) — v1 se enfoca en **event-ticket (EventTicket)** y **generic**, suficiente para el cine y el 80% de tickets.
- App Android nativa (SDK) — el link "Add to Wallet" cubre web/email/SMS.

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

// Emitir
const applePkpass: Buffer  = await pass.apple();   // .pkpass firmado
const google: { url: string; jwt: string } = await pass.google(); // link add-to-wallet

// Ciclo de vida (orquesta ambos)
await pass.update({ holder: { seat: "G2" } });  // Apple WS + Google PATCH
await pass.expire();                              // con relevantDate/state
await pass.revoke();

// Handler para Apple Web Service (el integrador lo monta en su server)
app.post("/wallet/v1/...", pass.appleWebServiceHandler());
```

**Notas de diseño:**
- El `qr` string se **valida y mapea**: a Apple `barcode.message` + `messageEncoding: iso-8859-1` y a Google `barcode.value` (`type: QR_CODE`). Si el integrador prefiere, acepta `qr` ya tipado (URL, token, etc.) para aplicar reglas por tipo. **Sanitizar SIEMPRE** el payload crudo antes de volcarlo a campos que se renderizan.
- `pass.appleWebServiceHandler()` es la pieza que hace trivial el endpoint HTTPS que Apple exige — sin él, el ciclo de vida Apple es inviable.

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

## 8. Ciclo de vida completo

### 8.1 Creación
- **Apple**: generar `.pkpass` firmado; distribuir como archivo/URL (Safari/Wallet lo importa).
- **Google**: **just-in-time** (class+object incrustados en el JWT, sin REST previo) o **pre-creada** (class reutilizable por ID + object por usuario); firmar JWT RS256 → link.

### 8.2 Actualización (update push)
- **Apple — Web Service Protocol** (Apple llama a TU server, HTTPS, header `Authorization: ApplePass <authenticationToken>`):
  - `POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}` — registro (`{pushToken}`).
  - `GET  /v1/passes/{passTypeIdentifier}/{serialNumber}` — **devuelve el .pkpass actualizado** (304 si no cambió).
  - `GET  /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}?passesUpdatedSince=` — serials a refrescar.
  - `DELETE /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}` — desregistro.
  - `POST /v1/log` — logging.
  - **Push (APNs)**: notificación `aps` para disparar refresh (opcional v1; habilita `hapns`).
- **Google — REST**: `PATCH`/update de class/object (`*.patch`), cambios de `state` (`ACTIVE`/`EXPIRED`/`SUSPENDED`), campos con `updateTime`. El integrador **llama** a Google (no al revés).

### 8.3 Expiración
- **Apple**: `expirationDate` + `relevantDate` en el pass; la wallet lo refleja.
- **Google**: `validTimeInterval` y/o `state: "EXPIRED"` vía update.

### 8.4 Revocación
- **Apple**: marcar `voided: true` y redistribuir vía Web Service + push.
- **Google**: cambiar `state` a `EXPIRED`/eliminación, con **callbacks** de save/delete si el integrador quiere tracking (opcional v1).

> La librería expone **una sola API de estado** (`update/expire/revoke`) y traduce a los dos mecanismos dispares. Ese es el "ciclo de vida orquestado" que hoy nadie empaqueta.

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
