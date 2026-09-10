# Changelog

All notable changes to this project are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-09-07

- Spike: wraps an existing QR into both Apple Wallet (`.pkpass` via `passkit-generator`) and Google Wallet (`@googleapis/walletobjects`) from the same payload.
- Unified `WalletPass` DSL: single input shape (`type`, `qr`, `meta`, `holder`, `branding`) mapped to Apple `pass.json` fields and Google class/object fields.
- Lifecycle handlers: Apple PassKit Web Service protocol (register/unregister/getSerialsForDevice/getLatestPass/logErrors) and a Google Wallet REST client for `EventTicketObject` upserts.
- Security: typed validation per `passType` that fails fast pre-emit, explicit credentials (`appleCredentials`/`googleCredentials`) that take priority over env vars for rotation without downtime, and an `onEmit` audit hook that logs only a 16-hex-char `serialHash` — never the raw QR.
- Sanitization applied to all integrator-sourced text fields (`eventName`, `venue`, `holder`, `logoText`, `organizationName`, `description`) and URL validation on `heroImage`.
