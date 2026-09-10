import { describe, expect, it } from "vitest";
import { renderTicketHtml, type TicketQr } from "./ticket-render.js";
import type { WalletPassInput } from "./wallet-pass.js";

const baseInput: WalletPassInput = {
  type: "event-ticket",
  qr: "cinemark|txn=4821|seat=F12",
  meta: {
    eventName: "Dune: Parte Tres",
    venue: "Cinemark Centro",
    startsAt: new Date("2026-09-12T21:30:00-05:00"),
    organizationName: "Cinemark",
  },
  holder: { seat: "F12", door: "B" },
  branding: { backgroundColor: "#000000", foregroundColor: "#FFFFFF" },
};

describe("renderTicketHtml", () => {
  it("renders a full HTML document", () => {
    const html = renderTicketHtml(baseInput);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("<title>");
  });

  it("renders chips from holder", () => {
    const html = renderTicketHtml(baseInput);
    expect(html).toContain("seat");
    expect(html).toContain("F12");
    expect(html).toContain("door");
    expect(html).toContain("B");
  });

  it("renders event name and venue in ticket head", () => {
    const html = renderTicketHtml(baseInput);
    expect(html).toContain("Dune: Parte Tres");
    expect(html).toContain("Cinemark Centro");
  });

  it("renders primary QR as SVG", () => {
    const html = renderTicketHtml(baseInput);
    expect(html).toContain("<svg");
    expect(html).toContain("viewBox");
    expect(html).toContain("</svg>");
  });

  it("renders status text", () => {
    const html = renderTicketHtml(baseInput);
    expect(html).toContain("Válido para una entrada");
  });

  it("renders zero secondary QRs when undefined", () => {
    const html = renderTicketHtml(baseInput);
    const secondaryCount = (html.match(/ticket-qr-wrap secondary/g) || []).length;
    expect(secondaryCount).toBe(0);
  });

  it("renders one secondary QR when provided", () => {
    const secondaryQrs: TicketQr[] = [{ id: "sec1", label: "Entrada extra", data: "extra-code" }];
    const html = renderTicketHtml(baseInput, secondaryQrs);
    expect(html).toContain("ticket-qr-wrap secondary");
    expect(html).toContain("Entrada extra");
  });

  it("renders multiple secondary QRs", () => {
    const secondaryQrs: TicketQr[] = [
      { id: "sec1", label: "Pase adicional", data: "extra1" },
      { id: "sec2", label: "Voucher", data: "extra2" },
    ];
    const html = renderTicketHtml(baseInput, secondaryQrs);
    const secondaryCount = (html.match(/ticket-qr-wrap secondary/g) || []).length;
    expect(secondaryCount).toBe(2);
    expect(html).toContain("Pase adicional");
    expect(html).toContain("Voucher");
  });

  it("sanitizes holder value containing script tags", () => {
    const dirty: WalletPassInput = {
      ...baseInput,
      holder: { seat: "F12<script>alert('xss')</script>", door: "B" },
    };
    const html = renderTicketHtml(dirty);
    // Script tag should be escaped (not present as literal <script>)
    expect(html).not.toContain("<script>");
    // The escaped version should be present
    expect(html).toContain("&lt;script&gt;");
  });

  it("sanitizes holder value containing control characters", () => {
    const dirty: WalletPassInput = {
      ...baseInput,
      holder: { seat: "F12\x00\x1F\x7F", door: "B" },
    };
    const html = renderTicketHtml(dirty);
    // The rendered HTML should contain the sanitized value (F12 with control chars removed)
    expect(html).toContain("F12");
    // But should NOT contain any of the control characters that were in the input
    expect(html).not.toContain("F12\x00");
    expect(html).not.toContain("F12\x1F");
    expect(html).not.toContain("F12\x7F");
  });

  it("sanitizes event name", () => {
    const dirty: WalletPassInput = {
      ...baseInput,
      meta: {
        ...baseInput.meta,
        eventName: "Event<img src=x onerror=alert(1)>",
      },
    };
    const html = renderTicketHtml(dirty);
    // HTML injection should be prevented by escaping < and >
    expect(html).not.toContain("<img");
    // The escaped version should be present
    expect(html).toContain("&lt;img");
  });

  it("includes branding colors in ticket-info style", () => {
    const html = renderTicketHtml(baseInput);
    expect(html).toContain("--ticket-color: #000000");
    expect(html).toContain("--ticket-ink: #FFFFFF");
  });

  it("renders heroImage when provided", () => {
    const withImage: WalletPassInput = {
      ...baseInput,
      meta: {
        ...baseInput.meta,
        heroImage: "https://example.com/poster.jpg",
      },
    };
    const html = renderTicketHtml(withImage);
    expect(html).toContain("ticket-media");
    expect(html).toContain("https://example.com/poster.jpg");
  });

  it("omits ticket-media when heroImage is not provided", () => {
    const html = renderTicketHtml(baseInput);
    // heroImage is not in baseInput.meta, so <div class="ticket-media"> should not appear
    expect(html).not.toContain('<div class="ticket-media">');
  });

  it("includes event date/time when startsAt is present", () => {
    const html = renderTicketHtml(baseInput);
    // Format depends on locale, but should include the date somewhere
    expect(html).toMatch(/\d{1,2}:\d{2}/); // Time format
  });

  it("handles empty holder object", () => {
    const empty: WalletPassInput = {
      type: "event-ticket",
      qr: "test-qr",
      meta: {
        eventName: "Test",
        venue: "Test Venue",
        startsAt: new Date(),
      },
    };
    const html = renderTicketHtml(empty);
    expect(html).toContain("Test");
    expect(html).not.toThrow;
  });

  it("sanitizes secondary QR labels", () => {
    const secondaryQrs: TicketQr[] = [{ id: "sec1", label: "QR<script>alert(1)</script>", data: "data" }];
    const html = renderTicketHtml(baseInput, secondaryQrs);
    // Script tag should be escaped
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders primary QR with SVG format from input.qr data", () => {
    const html = renderTicketHtml(baseInput);
    const qrCount = (html.match(/<svg/g) || []).length;
    expect(qrCount).toBeGreaterThanOrEqual(1); // At least one primary QR
  });
});
