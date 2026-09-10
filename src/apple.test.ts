import { describe, expect, it } from "vitest";
import { emitApplePassSpike } from "./apple.js";

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
