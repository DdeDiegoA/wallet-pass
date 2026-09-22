import { describe, expect, it } from "vitest";
import { toAppleBarcode, toGoogleBarcode } from "./qr.js";

const QR = "wallet-pass-spike|txn=1";

describe("QR -> barcode mapping", () => {
  it("maps to Apple barcode shape", () => {
    const barcode = toAppleBarcode(QR);
    expect(barcode.format).toBe("PKBarcodeFormatQR");
    expect(barcode.message).toBe(QR);
    expect(barcode.messageEncoding).toBe("iso-8859-1");
  });

  it("maps to Google barcode shape", () => {
    const barcode = toGoogleBarcode(QR);
    expect(barcode.type).toBe("QR_CODE");
    expect(barcode.value).toBe(QR);
  });

  it("rejects empty QR payloads", () => {
    expect(() => toAppleBarcode("")).toThrow();
    expect(() => toGoogleBarcode("")).toThrow();
  });

  it("throws for a QR not representable in latin-1 instead of mis-encoding it", () => {
    expect(() => toAppleBarcode("ticket-🎟️")).toThrow(/ISO-8859-1/);
    expect(toAppleBarcode("ticket-123").message).toBe("ticket-123");
  });

  it("strips control chars and truncates the QR payload", () => {
    const dirty = "q\x00r\n".padEnd(600, "x");
    expect(toAppleBarcode(dirty).message).not.toMatch(/[\x00-\x1F\x7F]/);
    expect(toAppleBarcode(dirty).message.length).toBeLessThanOrEqual(500);
    expect(toGoogleBarcode(dirty).value).not.toMatch(/[\x00-\x1F\x7F]/);
  });
});
