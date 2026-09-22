import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PKPass } from "passkit-generator";
import { toAppleBarcode } from "./qr.js";

export interface ApplePassResult {
  dryRun: boolean;
  pkpass?: Buffer;
  reason?: string;
}

export interface ApplePassField {
  key: string;
  label?: string;
  value: string;
  textAlignment?: "PKTextAlignmentLeft" | "PKTextAlignmentCenter" | "PKTextAlignmentRight" | "PKTextAlignmentNatural";
  changeMessage?: string;
}

/** Full pass.json customization (PRD.md §7 Apple). All optional — spike defaults apply when omitted. */
export interface ApplePassFields {
  headerFields?: ApplePassField[];
  primaryFields?: ApplePassField[];
  secondaryFields?: ApplePassField[];
  auxiliaryFields?: ApplePassField[];
  backFields?: ApplePassField[];
  logoText?: string;
  organizationName?: string;
  description?: string;
  foregroundColor?: string;
  backgroundColor?: string;
  labelColor?: string;
}

/**
 * Explicit credentials (PRD.md §9.2 rotation without downtime): pass these to
 * override APPLE_PASS_CERT/APPLE_WWDR_CERT so a consumer can rotate/multi-tenant
 * without restarting the process or relying on a single global env var.
 * ponytail: real HSM/PKCS#11 signing (never load key into process memory) is
 * out of scope for an OSS v1 library — see PRD.md §9.2 for the upgrade path.
 */
export interface AppleCredentials {
  /** Combined PEM: Pass Type ID certificate + its private key concatenated. */
  cert: Buffer;
  /** Apple WWDR intermediate certificate PEM. */
  wwdr: Buffer;
  passphrase?: string;
}

const MODEL_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "spike.pass",
);

/**
 * Spike: emits a real signed .pkpass (PRD.md §12) from a plain QR string,
 * with optional full field customization (PRD.md §7) for the WalletPass DSL.
 */
export async function emitApplePassSpike(
  qr: string,
  fields: ApplePassFields = {},
  credentials?: AppleCredentials,
  serialNumber = "wallet-pass-spike-1",
): Promise<ApplePassResult> {
  let signerCert: Buffer;
  let wwdr: Buffer;
  let passphrase: string | undefined;

  if (credentials) {
    signerCert = credentials.cert;
    wwdr = credentials.wwdr;
    passphrase = credentials.passphrase;
  } else {
    const certPath = process.env.APPLE_PASS_CERT;
    const wwdrPath = process.env.APPLE_WWDR_CERT;

    if (!certPath || !wwdrPath) {
      // ponytail: dry-run — falta APPLE_PASS_CERT (PEM del cert Pass Type ID +
      // su private key) y APPLE_WWDR_CERT (PEM intermedio de Apple). Requiere
      // Apple Developer Program (~$99/año), ver PRD.md §9.1/§10. En real: set
      // APPLE_PASS_CERT=/path/signer.pem APPLE_WWDR_CERT=/path/wwdr.pem
      // (+ APPLE_PASS_CERT_PASSPHRASE si la key está protegida).
      return {
        dryRun: true,
        reason:
          "faltan APPLE_PASS_CERT / APPLE_WWDR_CERT (Pass Type ID cert + WWDR intermedio). Ver PRD.md §9.1.",
      };
    }

    [signerCert, wwdr] = await Promise.all([readFile(certPath), readFile(wwdrPath)]);
    passphrase = process.env.APPLE_PASS_CERT_PASSPHRASE;
  }

  // forge.pki reads ONLY the first PEM block of whatever buffer it's handed
  // (`pem.decode(pem)[0]`), for BOTH certificateFromPem and decryptRsaPrivateKey.
  // So the combined cert+key buffer cannot be passed to both fields — split it.
  const combined = signerCert.toString("utf-8");
  const certPem = combined.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/,
  )?.[0];
  const keyPem = combined.match(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/,
  )?.[0];

  const pass = await PKPass.from(
    {
      model: MODEL_DIR,
      certificates: {
        wwdr,
        signerCert: certPem ? Buffer.from(certPem) : signerCert,
        signerKey: keyPem ? Buffer.from(keyPem) : signerCert,
        signerKeyPassphrase: passphrase,
      },
    },
    {
      serialNumber,
      passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
      teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
      ...(fields.logoText ? { logoText: fields.logoText } : {}),
      ...(fields.organizationName ? { organizationName: fields.organizationName } : {}),
      ...(fields.description ? { description: fields.description } : {}),
      ...(fields.foregroundColor ? { foregroundColor: fields.foregroundColor } : {}),
      ...(fields.backgroundColor ? { backgroundColor: fields.backgroundColor } : {}),
      ...(fields.labelColor ? { labelColor: fields.labelColor } : {}),
    },
  );
  pass.setBarcodes(toAppleBarcode(qr));
  for (const f of fields.headerFields ?? []) pass.headerFields.push(f);
  for (const f of fields.primaryFields ?? []) pass.primaryFields.push(f);
  for (const f of fields.secondaryFields ?? []) pass.secondaryFields.push(f);
  for (const f of fields.auxiliaryFields ?? []) pass.auxiliaryFields.push(f);
  for (const f of fields.backFields ?? []) pass.backFields.push(f);

  return { dryRun: false, pkpass: pass.getAsBuffer() };
}
