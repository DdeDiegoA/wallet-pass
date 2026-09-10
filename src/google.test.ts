import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { emitGoogleWalletSpike } from "./google.js";

function decodePayload(jwt: string) {
  const [, payloadB64] = jwt.split(".");
  return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
}

describe("emitGoogleWalletSpike", () => {
  beforeEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_JWT_ORIGINS;
  });

  it("dry-runs without throwing when service account JSON is missing", () => {
    const result = emitGoogleWalletSpike("wallet-pass-spike|txn=1");

    expect(result.dryRun).toBe(true);
    expect(result.reason).toBeTruthy();
    expect(result.jwt).toBeUndefined();
  });

  it("signs a JWT with iss/aud/typ/iat/exp/origins claims", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "spike@example-project.iam.gserviceaccount.com",
      private_key: privateKeyPem,
    });
    process.env.GOOGLE_JWT_ORIGINS = "https://example.com, https://app.example.com";

    const result = emitGoogleWalletSpike("wallet-pass-spike|txn=1");

    expect(result.dryRun).toBe(false);
    expect(result.jwt).toBeTruthy();

    const payload = decodePayload(result.jwt as string);
    expect(payload.iss).toBe("spike@example-project.iam.gserviceaccount.com");
    expect(payload.aud).toBe("google");
    expect(payload.typ).toBe("savetowallet");
    expect(typeof payload.iat).toBe("number");
    expect(payload.exp).toBe(payload.iat + 60 * 60);
    expect(payload.origins).toEqual(["https://example.com", "https://app.example.com"]);
  });

  it("defaults origins to an empty array when GOOGLE_JWT_ORIGINS is unset", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "spike@example-project.iam.gserviceaccount.com",
      private_key: privateKeyPem,
    });

    const result = emitGoogleWalletSpike("wallet-pass-spike|txn=1");
    const payload = decodePayload(result.jwt as string);

    expect(payload.origins).toEqual([]);
  });
});
