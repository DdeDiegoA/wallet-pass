import { describe, expect, it } from "vitest";
import { VERSION, renderTicketHtml, WalletPass, type WalletPassInput } from "./index.js";

describe("scaffold", () => {
  it("exports a version string", () => {
    expect(VERSION).toBe("0.1.0");
  });
});

describe("renderTicketHtml integration", () => {
  it("builds WalletPassInput, constructs WalletPass, and renders HTML without throwing", () => {
    const input: WalletPassInput = {
      type: "event-ticket",
      qr: "integration-test|txn=123",
      meta: {
        eventName: "Integration Test Event",
        venue: "Test Venue",
        startsAt: new Date("2026-10-15T19:00:00Z"),
      },
      holder: { seat: "A1", door: "Main" },
      branding: { backgroundColor: "#0071e3", foregroundColor: "#ffffff" },
    };

    expect(() => {
      new WalletPass(input);
    }).not.toThrow();

    const html = renderTicketHtml(input);
    expect(html).toContain("Integration Test Event");
    expect(html).toContain("Test Venue");
    expect(html).toContain("<svg");
  });
});
