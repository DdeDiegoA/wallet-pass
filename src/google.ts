import { createSign } from "node:crypto";
import { toGoogleBarcode } from "./qr.js";

export interface GoogleWalletResult {
  dryRun: boolean;
  jwt?: string;
  url?: string;
  reason?: string;
}

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

/** Class + object customization (PRD.md §7 Google Wallet). All optional. */
export interface GoogleClassFields {
  issuerName?: string;
  eventName?: string;
  venue?: string;
  /** ISO 8601 datetime string. */
  dateTimeStart?: string;
  hexBackgroundColor?: string;
  /** URL of the hero image. */
  heroImage?: string;
}

/**
 * Explicit credentials (PRD.md §9.2 rotation without downtime): pass these to
 * override GOOGLE_SERVICE_ACCOUNT_JSON so a consumer can rotate/multi-tenant
 * without restarting the process or relying on a single global env var.
 */
export interface GoogleCredentials {
  serviceAccountJson: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function localized(value: string) {
  return { defaultValue: { language: "en", value } };
}

/**
 * Spike: emits a "save to wallet" link via a just-in-time signed JWT
 * (class+object embedded, no REST call needed — PRD.md §8.1). Signs by
 * hand with node:crypto since a spike doesn't need the full REST client
 * from @googleapis/walletobjects.
 */
export function emitGoogleWalletSpike(
  qr: string,
  issuerId = "spike-issuer",
  classFields: GoogleClassFields = {},
  credentials?: GoogleCredentials,
  serial = "wallet-pass-spike-1",
): GoogleWalletResult {
  const raw = credentials?.serviceAccountJson ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    // ponytail: dry-run — falta GOOGLE_SERVICE_ACCOUNT_JSON (contenido JSON
    // del service account, scope wallet_object.issuer + alta de issuer en
    // Google Pay & Wallet console). Ver PRD.md §9.1 / §10. En real: set
    // GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"...","private_key":"..."}'
    return {
      dryRun: true,
      reason:
        "falta GOOGLE_SERVICE_ACCOUNT_JSON (service account JSON con scope wallet_object.issuer). Ver PRD.md §9.1.",
    };
  }

  let account: GoogleServiceAccount;
  try {
    account = JSON.parse(raw) as GoogleServiceAccount;
  } catch {
    return { dryRun: true, reason: "GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido" };
  }

  const objectId = `${issuerId}.${serial}`;
  const classId = `${issuerId}.wallet-pass-spike-class`;
  const origins = (process.env.GOOGLE_JWT_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: account.client_email,
    aud: "google",
    typ: "savetowallet",
    iat,
    exp: iat + 60 * 60, // 1h — bounds blast radius if this JWT leaks/gets logged
    origins,
    payload: {
      genericClasses: [
        {
          id: classId,
          reviewStatus: "UNDER_REVIEW",
          ...(classFields.issuerName ? { issuerName: classFields.issuerName } : {}),
          ...(classFields.eventName ? { eventName: localized(classFields.eventName) } : {}),
          ...(classFields.venue ? { venue: { name: localized(classFields.venue) } } : {}),
          ...(classFields.dateTimeStart ? { dateTime: { start: classFields.dateTimeStart } } : {}),
          ...(classFields.hexBackgroundColor
            ? { hexBackgroundColor: classFields.hexBackgroundColor }
            : {}),
          ...(classFields.heroImage
            ? { heroImage: { sourceUri: { uri: classFields.heroImage } } }
            : {}),
        },
      ],
      genericObjects: [
        {
          id: objectId,
          classId,
          genericType: "GENERIC_TYPE_UNSPECIFIED",
          cardTitle: localized(classFields.eventName ?? "Wallet Pass Spike"),
          header: localized(classFields.venue ?? "Spike"),
          ...(classFields.hexBackgroundColor
            ? { hexBackgroundColor: classFields.hexBackgroundColor }
            : {}),
          ...(classFields.heroImage
            ? { heroImage: { sourceUri: { uri: classFields.heroImage } } }
            : {}),
          barcode: toGoogleBarcode(qr),
        },
      ],
    },
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(account.private_key);
  const jwt = `${signingInput}.${base64url(signature)}`;

  return { dryRun: false, jwt, url: `https://pay.google.com/gp/v/save/${jwt}` };
}
