# Design System

> This project has **no UI**. `wallet-pass` is a backend TypeScript library; there are no screens, components, or visual design system to maintain.

## What lives here

Nothing visual. This file exists only to prevent future agents from searching for a design system or UI components that do not exist.

## Branding surface

The only "visual" artifacts are pass-level assets controlled by the integrator and emitted by the library:

- Apple `.pkpass` bundle images: `icon.png`, `logo.png`, `strip.png`, `footer.png`, `background.png`, `thumbnail.png` (plus `@2x`/`@3x` variants).
- Google Wallet class/object images: `logo`, `heroImage`, `wideLogo`.
- Color values passed by the integrator via the DSL (`backgroundColor`, `foregroundColor`, `hexBackgroundColor`, etc.).

These are inputs/outputs of the library, not a design system.

## See also

- `docs/specs/spec.md` — functional spec and proposed API.
- `docs/architecture/` — architecture and lifecycle details.
