import QRCode from "qrcode";
import { sanitizeText } from "./sanitize.js";
import type { WalletPassInput } from "./wallet-pass.js";

export interface TicketQr {
  id: string;
  label: string;
  data: string;
}

// HTML escape user input to prevent injection
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Real, scannable QR (qrcode.create is synchronous — no async API surface needed here). */
function generateQrSvg(data: string): string {
  const { modules } = QRCode.create(data, { errorCorrectionLevel: "M" });
  const size = modules.size;
  const rects: string[] = [];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (modules.get(i, j)) rects.push(`<rect x="${j}" y="${i}" width="1" height="1"/>`);
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects.join("")}</g></svg>`;
}

export function renderTicketHtml(input: WalletPassInput, secondaryQrs?: TicketQr[]): string {
  const { meta, holder = {}, branding = {} } = input;
  const ticketColor = branding.backgroundColor || "#0071e3";
  const ticketInk = branding.foregroundColor || "#ffffff";

  const sanitizedEventName = sanitizeText(meta.eventName ?? "");
  const sanitizedVenue = sanitizeText(meta.venue ?? "");
  const sanitizedOrgName = sanitizeText(meta.organizationName ?? "");
  const sanitizedDesc = sanitizeText(meta.description ?? "");
  const sanitizedLogoText = sanitizeText(meta.logoText ?? "");

  // Render holder chips
  const chipsHtml = Object.entries(holder)
    .map(([key, value]) => {
      const sanitizedValue = sanitizeText(String(value));
      return `<div class="ticket-chip"><span class="k">${escapeHtml(sanitizeText(key))}</span><span class="v">${escapeHtml(sanitizedValue)}</span></div>`;
    })
    .join("");

  // Format time if startsAt exists
  const timeStr =
    meta.startsAt instanceof Date && !Number.isNaN(meta.startsAt.getTime())
      ? meta.startsAt.toLocaleString("es-ES", {
          weekday: "short",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  // Render primary QR
  const primaryQrSvg = generateQrSvg(input.qr);

  // Render secondary QRs
  const secondaryQrsHtml =
    secondaryQrs?.map((qr) => {
      const sanitizedLabel = sanitizeText(qr.label);
      const qrSvg = generateQrSvg(qr.data);
      return `<div class="ticket-qr-wrap secondary"><p class="secondary-qr-label">${escapeHtml(sanitizedLabel)}</p><div class="ticket-qr">${qrSvg}</div></div>`;
    }).join("") ?? "";

  const statusText = "Válido para una entrada";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${sanitizedEventName ? `${escapeHtml(sanitizedEventName)} · Wallet` : "Wallet"}</title>
<style>
  :root {
    --bg:      #ffffff;
    --surface: #f5f5f7;
    --fg:      #1d1d1f;
    --muted:   #6e6e73;
    --border:  #d2d2d7;
    --accent:  #0071e3;

    --accent-soft: color-mix(in oklch, var(--accent) 14%, transparent);
    --fg-soft:     color-mix(in oklch, var(--fg) 6%, transparent);

    --font-display: "SF Pro Display", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif;
    --font-body:    "SF Pro Text", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif;
    --font-mono:    ui-monospace, "SF Mono", Menlo, monospace;

    --fs-h1: 22px;
    --fs-h2: 19px;
    --fs-h3: 16px;
    --fs-body: 15px;
    --fs-meta: 12px;

    --radius-card: 22px;
    --radius-pill: 999px;
  }

  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: radial-gradient(60% 80% at 50% 0%, color-mix(in oklch, var(--accent) 6%, var(--bg)) 0%, var(--bg) 60%);
    color: var(--fg);
    font-family: var(--font-body);
    font-size: var(--fs-body);
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
    padding: 32px 16px;
  }

  .ticket-stack { display: flex; flex-direction: column; gap: 20px; max-width: 450px; margin: 0 auto; }

  .ticket {
    position: relative;
    border-radius: var(--radius-card);
    overflow: hidden;
    background: var(--surface);
    box-shadow: 0 14px 30px -12px rgba(0,0,0,0.28), 0 2px 8px -2px rgba(0,0,0,0.12);
  }

  .ticket-media { position: relative; aspect-ratio: 4 / 3; background: var(--fg); overflow: hidden; }
  .ticket-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .ticket-media .scrim {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 42%, transparent 60%);
    pointer-events: none;
  }

  .ticket-seam { position: relative; height: 0; }
  .ticket-seam::before {
    content: '';
    position: absolute;
    top: -11px; left: 50%; transform: translateX(-50%);
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--bg);
    z-index: 2;
  }

  .ticket-info {
    position: relative;
    padding: 22px 18px 20px;
    background: var(--ticket-color, var(--accent));
    color: var(--ticket-ink, #fff);
  }
  .ticket-info::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0;
    border-top: 1px dashed color-mix(in oklch, var(--ticket-ink, #fff) 30%, transparent);
  }

  .ticket-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .ticket-name { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; margin: 0; }
  .ticket-sub  { font-size: 12px; opacity: 0.82; margin: 4px 0 0; font-family: var(--font-mono); text-align: right; white-space: nowrap; }

  .ticket-chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
  .ticket-chip {
    background: color-mix(in oklch, var(--ticket-ink, #fff) 16%, transparent);
    border: 1px solid color-mix(in oklch, var(--ticket-ink, #fff) 24%, transparent);
    border-radius: 12px;
    padding: 8px 8px;
    text-align: center;
  }
  .ticket-chip .k { display: block; font-size: 9px; letter-spacing: 0.05em; text-transform: uppercase; opacity: 0.78; font-family: var(--font-mono); margin-bottom: 3px; }
  .ticket-chip .v { display: block; font-size: 13px; font-weight: 600; font-family: var(--font-mono); }

  .ticket-qr-wrap { display: flex; justify-content: center; margin-top: 18px; flex-direction: column; align-items: center; }
  .ticket-qr-wrap.secondary { opacity: 0.75; margin-top: 12px; }
  .secondary-qr-label { font-size: 11px; margin: 0 0 6px 0; opacity: 0.85; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; }

  .ticket-qr {
    width: 168px; height: 168px;
    background: #fdfdfd;
    border-radius: 18px;
    padding: 14px;
    box-shadow: 0 8px 18px -8px rgba(0,0,0,0.35);
  }
  .ticket-qr svg { width: 100%; height: 100%; display: block; object-fit: contain; }

  .ticket-status {
    text-align: center; margin-top: 10px;
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    opacity: 0.85;
  }
</style>
</head>
<body>
<div class="ticket-stack">
<article class="ticket">
${
  meta.heroImage
    ? `<div class="ticket-media">
<img src="${escapeHtml(sanitizeText(meta.heroImage))}" alt="${escapeHtml(sanitizedEventName)}" />
<div class="scrim"></div>
</div>`
    : ""
}
<div class="ticket-seam"></div>
<div class="ticket-info" style="--ticket-color: ${ticketColor}; --ticket-ink: ${ticketInk};">
<div class="ticket-head">
<p class="ticket-name">${escapeHtml(sanitizedEventName)}</p>
<p class="ticket-sub">${escapeHtml(sanitizedVenue)}${timeStr ? `<br>${escapeHtml(timeStr)}` : ""}</p>
</div>
${chipsHtml ? `<div class="ticket-chips">${chipsHtml}</div>` : ""}
<div class="ticket-qr-wrap">
<div class="ticket-qr">${primaryQrSvg}</div>
</div>
${secondaryQrsHtml}
<p class="ticket-status">${statusText}</p>
</div>
</article>
</div>
</body>
</html>`;
}
