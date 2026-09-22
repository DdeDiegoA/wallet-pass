import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emitApplePassSpike, type AppleCredentials } from "./apple.js";

describe("emitApplePassSpike", () => {
  it("dry-runs without throwing when credentials are missing", async () => {
    delete process.env.APPLE_PASS_CERT;
    delete process.env.APPLE_WWDR_CERT;

    const result = await emitApplePassSpike("wallet-pass-spike|txn=1");

    expect(result.dryRun).toBe(true);
    expect(result.reason).toBeTruthy();
    expect(result.pkpass).toBeUndefined();
  });
});

describe("emitApplePassSpike real signing path (#3)", () => {
  let skip = false;
  let credentials: AppleCredentials | undefined;
  let certDir: string | undefined;
  const savedEnv = {
    type: process.env.APPLE_PASS_TYPE_IDENTIFIER,
    team: process.env.APPLE_TEAM_IDENTIFIER,
  };

  // Self-signed test material only (no production creds, nothing committed).
  // passkit-generator doesn't validate the chain against Apple — a self-signed
  // cert yields a structurally valid, signed .pkpass, which is what #3 proves.
  beforeAll(() => {
    try {
      certDir = mkdtempSync(join(tmpdir(), "wallet-pass-cert-"));
      const gen = (cn: string, out: string) =>
        execSync(
          `openssl req -x509 -newkey rsa:2048 -keyout ${join(certDir!, `${out}.key`)} -out ${join(certDir!, `${out}.pem`)} -days 1 -nodes -subj '/CN=${cn}'`,
          { stdio: "ignore" },
        );
      gen("wallet-pass-test", "signer");
      gen("wallet-pass-wwdr", "wwdr");
      const certPem = readFileSync(join(certDir, "signer.pem"));
      const keyPem = readFileSync(join(certDir, "signer.key"));
      credentials = {
        cert: Buffer.concat([certPem, keyPem]),
        wwdr: readFileSync(join(certDir, "wwdr.pem")),
      };
    } catch {
      skip = true;
    }
  });

  afterAll(() => {
    process.env.APPLE_PASS_TYPE_IDENTIFIER = savedEnv.type;
    process.env.APPLE_TEAM_IDENTIFIER = savedEnv.team;
    if (certDir) rmSync(certDir, { recursive: true, force: true });
  });

  it.skipIf(skip)("signs a structurally valid .pkpass with a test certificate", async () => {
    process.env.APPLE_PASS_TYPE_IDENTIFIER = "pass.test.walletpass";
    process.env.APPLE_TEAM_IDENTIFIER = "TEST123456";

    const r = await emitApplePassSpike("https://ticket.example/abc", {}, credentials);

    expect(r.dryRun).toBe(false);
    expect(Buffer.isBuffer(r.pkpass)).toBe(true);
    expect((r.pkpass as Buffer).subarray(0, 2).toString("latin1")).toBe("PK");

    const raw = (r.pkpass as Buffer).toString("latin1");
    for (const name of ["pass.json", "manifest.json", "signature"]) {
      expect(raw.includes(name)).toBe(true);
    }

    // ponytail: pass.json may be deflated — only assert the barcode if it's
    // stored uncompressed. The barcode-content check is #8's job (real creds).
    if (raw.includes('"barcodes"')) {
      expect(raw).toContain("https://ticket.example/abc");
    }
  });
});
