// ponytail: QR-first mapping (PRD.md §6/§7). Sanitizacion basica (control
// chars + longitud); validacion tipada por passType es Fase 3, ver PRD.md
// seccion 9.3.
import { sanitizeText } from "./sanitize.js";

export interface AppleBarcode {
  format: "PKBarcodeFormatQR";
  message: string;
  messageEncoding: "iso-8859-1";
  altText?: string;
}

export interface GoogleBarcode {
  type: "QR_CODE";
  value: string;
}

export function toAppleBarcode(qr: string, altText?: string): AppleBarcode {
  if (!qr) throw new Error("qr payload is required");
  return {
    format: "PKBarcodeFormatQR",
    message: sanitizeText(qr),
    messageEncoding: "iso-8859-1",
    ...(altText ? { altText: sanitizeText(altText) } : {}),
  };
}

export function toGoogleBarcode(qr: string): GoogleBarcode {
  if (!qr) throw new Error("qr payload is required");
  return { type: "QR_CODE", value: sanitizeText(qr) };
}
