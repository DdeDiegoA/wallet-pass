---
titulo: "Revisión adversarial — abogado del diablo"
fecha: 2026-09-05
objeto: PRD wallet-pass (v0.1)
metodo: skill abogado-del-diablo vía OpenCode (opencode-go/deepseek-v4-flash) + búsqueda web real
estado: entregado
---

# Veredicto adversarial (abogado del diablo)

## VEREDICTO
Esto no es una librería que llena un vacío: es una librería que envuelve a otra librería dominante para pegar un string en un campo `barcode`, y el PRD lo sabe — el riesgo #1 del propio documento es exactamente lo que el producto ES. Muere por irrelevancia, no por bug. La feature ya está en los demos oficiales de Apple/Google y en las plataformas de ticketing (Spektrix, Ticketable, PassKit SaaS, Passinstance, CodeREADr, PassCreator). Cero economía, mantenimiento eterno para un ingeniero, y el elefante: la PRD existe para justificar la librería, no para resolver un problema que alguien pague.

## Grietas (por severidad)

1. **El valor prometido es un script de 50 líneas, verificado en mercado.** "QR-first/mapping" = `barcode: {message: qr, messageEncoding: "iso-8859-1"}` (Apple) y `barcode: {value: qr, type: "QR_CODE"}` (Google) — dos asignaciones ya en passkit-generator + demos oficiales. Competidor invisible: las plataformas que el integrador ya usa (Spektrix empaquetó wallet; Ticketable lo tiene como feature; PassKit/Passinstance/CodeREADr lo venden como SaaS; PassCreator lo describe literal como "wraps your existing code into the required .pkpass format").
2. **La premisa dual es la apuesta más frágil.** El PRD lo admite (riesgo #2). La mayoría de integradores son single-platform en la práctica. Google además publica `pass-converter` oficial (conversión entre formatos, comoditizando la capa reclamada como "el gap").
3. **El ciclo de vida Apple es operación, no código.** `webServiceURL` exige hosting HTTPS + push APNs + renovación anual del cert. El handler ahorra ~200 líneas; el costo real es operativo. Y el glue Apple ya existe: `@destinationstransfers/passkit` (web service + push) y `passkit-webservice-toolkit` + `hapns` (mismo autor de passkit-generator).
4. **OSS sin economía, mantenimiento eterno para una persona.** Techo medible del género: passkit-generator = 12 dependents npm, un mantenedor, aun siendo dominante. $99/año para probar + service account + aprobación issuer + hosting demo + soporte gratis a negocios de otros.
5. **"Seguridad empaquetada" es marketing, no foso.** El XSS en WebView es débil (Apple/Google renderizan strings, no HTML). El riesgo real (scanner del integrador ejecutando contra SU backend) la lib no lo toca.
6. **Ejecución: un ingeniero, dos contratos de plataforma divergentes.** Probar Apple lifecycle exige cert + endpoint hosteado; Google fuera de demo exige aprobación. El spike del punto 0 no se valida de punta a punta sin pagar/gestionar ambas.
7. **Pre-mortem 12 meses:** publica, ~100 installs, issues de iOS 18.x / Google REJECTED, integradores reales usan demos o SaaS, archiva el repo "no mantenido". Muere por innecesaria.
8. **Punto ciego:** la PRD se escribió llena de confesiones (riesgo #1/#2, `ponytail:`) como si autocriticarse reemplazara a un usuario que pague. Cero cifra de mercado, cero nombre de integrador, cero entrevista.

## LA QUE LO MATA
La irrelevancia. El valor ya está en demos oficiales + plataformas de ticketing; lo del medio es un script de 50 líneas. La opción más barata y segura para el integrador real es NO usar esta librería.

## Si insistes (acciones priorizadas)
1. Entrevista a 10 integradores reales ANTES de código. Si <3 describen pipeline dual + propio + con dolor operativo real → no hay producto.
2. Cierra el spike del punto 0 y publica su autopsia (el conocimiento real es el activo).
3. Replantea el entregable honesto: playbook de operación + consultoría, no paquete npm.
4. Define monetización antes de publicar (sponsorship, o wallet-as-a-service cobrando por pass — el ciclo Apple que la lib no empaqueta, tú sí como servicio).
5. Si sigues con la lib: corta el dual, lanza Google-only + event-ticket, Apple WS como fase 2 con un integrador pagando.

## Prior art adicional (no estaba en la PRD)
- `@destinationstransfers/passkit` (web service + push integrados)
- Plataformas: Spektrix, Ticketable, PassKit, Passinstance, CodeREADr, PassCreator (QR-code-generator.com)
- `google-wallet/pass-converter` (conversión entre formatos, oficial Google)
