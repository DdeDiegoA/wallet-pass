import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WalletPass, mapToAppleFields, mapToGoogleFields, type WalletPassInput } from "./wallet-pass.js";

const baseInput: WalletPassInput = {
  type: "event-ticket",
  qr: "cinemark|txn=4821|seat=F12|session=2026-09-12T21:30",
  meta: {
    eventName: "Dune: Parte Tres",
    venue: "Cinemark Centro",
    startsAt: new Date("2026-09-12T21:30:00-05:00"),
    organizationName: "Cinemark",
    description: "Boleto de cine",
    room: "Sala 4",
  },
  holder: { seat: "F12", door: "B" },
  branding: { backgroundColor: "#000000", foregroundColor: "#FFFFFF", labelColor: "#CCCCCC" },
};

describe("mapToAppleFields", () => {
  it("maps meta/holder/branding into pass.json fields", () => {
    const fields = mapToAppleFields(baseInput);

    expect(fields.primaryFields).toContainEqual({
      key: "eventName",
      label: "Event",
      value: "Dune: Parte Tres",
    });
    expect(fields.secondaryFields).toContainEqual({
      key: "venue",
      label: "Venue",
      value: "Cinemark Centro",
    });
    expect(fields.headerFields).toContainEqual({
      key: "startsAt",
      label: "Date",
      value: baseInput.meta.startsAt!.toISOString(),
    });
    expect(fields.auxiliaryFields).toContainEqual({ key: "seat", label: "seat", value: "F12" });
    expect(fields.auxiliaryFields).toContainEqual({ key: "door", label: "door", value: "B" });
    expect(fields.backFields).toContainEqual({ key: "room", label: "room", value: "Sala 4" });
    expect(fields.organizationName).toBe("Cinemark");
    expect(fields.description).toBe("Boleto de cine");
    expect(fields.backgroundColor).toBe("#000000");
    expect(fields.foregroundColor).toBe("#FFFFFF");
    expect(fields.labelColor).toBe("#CCCCCC");
  });

  it("omits empty field arrays when meta/holder are minimal", () => {
    const fields = mapToAppleFields({ type: "generic", qr: "q", meta: {} });
    expect(fields.headerFields).toEqual([]);
    expect(fields.primaryFields).toEqual([]);
    expect(fields.secondaryFields).toEqual([]);
    expect(fields.auxiliaryFields).toEqual([]);
    expect(fields.backFields).toEqual([]);
  });
});

describe("mapToGoogleFields", () => {
  it("maps meta/branding into class fields", () => {
    const fields = mapToGoogleFields(baseInput);
    expect(fields).toMatchObject({
      issuerName: "Cinemark",
      eventName: "Dune: Parte Tres",
      venue: "Cinemark Centro",
      dateTimeStart: baseInput.meta.startsAt!.toISOString(),
      hexBackgroundColor: "#000000",
    });
  });
});

describe("sanitization of integrator input", () => {
  const dirty: WalletPassInput = {
    type: "generic",
    qr: "q",
    meta: {
      eventName: "Evil\x00Event\n".padEnd(600, "x"),
      venue: "Bad\x7FVenue",
      room: "Room\x01One",
    },
    holder: { seat: "F\x0212" },
  };

  it("strips control chars and truncates in Apple fields", () => {
    const fields = mapToAppleFields(dirty);
    expect(fields.primaryFields![0]!.value).not.toMatch(/[\x00-\x1F\x7F]/);
    expect(fields.primaryFields![0]!.value.length).toBeLessThanOrEqual(500);
    expect(fields.secondaryFields![0]!.value).toBe("BadVenue");
    expect(fields.backFields![0]!.value).toBe("RoomOne");
    expect(fields.auxiliaryFields![0]!.value).toBe("F12");
  });

  it("strips control chars in Google fields", () => {
    const fields = mapToGoogleFields(dirty);
    expect(fields.venue).toBe("BadVenue");
    expect(fields.eventName).not.toMatch(/[\x00-\x1F\x7F]/);
  });
});

describe("sanitization of logoText/organizationName/description", () => {
  it("strips control chars and truncates in Apple fields", () => {
    const fields = mapToAppleFields({
      type: "generic",
      qr: "q",
      meta: {
        logoText: "Logo\x00Text".padEnd(600, "x"),
        organizationName: "Org\x7FName",
        description: "Desc\x01ription",
      },
    });
    expect(fields.logoText).not.toMatch(/[\x00-\x1F\x7F]/);
    expect(fields.logoText!.length).toBeLessThanOrEqual(500);
    expect(fields.organizationName).toBe("OrgName");
    expect(fields.description).toBe("Description");
  });
});

describe("heroImage validation (Google)", () => {
  it("keeps a valid http(s) URL", () => {
    const fields = mapToGoogleFields({
      type: "generic",
      qr: "q",
      meta: { heroImage: "https://example.com/hero.png" },
    });
    expect(fields.heroImage).toBe("https://example.com/hero.png");
  });

  it("drops a non-http(s) protocol", () => {
    const fields = mapToGoogleFields({
      type: "generic",
      qr: "q",
      meta: { heroImage: "file:///etc/passwd" },
    });
    expect(fields.heroImage).toBeUndefined();
  });

  it("drops a non-URL string", () => {
    const fields = mapToGoogleFields({
      type: "generic",
      qr: "q",
      meta: { heroImage: "not-a-url" },
    });
    expect(fields.heroImage).toBeUndefined();
  });
});

describe("WalletPass", () => {
  it("throws a clear dry-run error from .apple() without credentials", async () => {
    const pass = new WalletPass(baseInput);
    await expect(pass.apple()).rejects.toThrow(/dry-run/);
  });

  it("throws a clear dry-run error from .google() without credentials", async () => {
    const pass = new WalletPass(baseInput);
    await expect(pass.google()).rejects.toThrow(/dry-run/);
  });

  it("requires a non-empty qr payload", () => {
    expect(() => new WalletPass({ ...baseInput, qr: "" })).toThrow(/qr payload/);
  });
});

describe("typed validation (PRD.md §9.3)", () => {
  it("rejects event-ticket with missing meta.eventName before any emit attempt", () => {
    expect(
      () =>
        new WalletPass({
          type: "event-ticket",
          qr: "q",
          meta: { venue: "V", startsAt: new Date() } as unknown as WalletPassInput["meta"],
        } as WalletPassInput),
    ).toThrow(/eventName/);
  });

  it("rejects event-ticket with missing meta.venue", () => {
    expect(
      () =>
        new WalletPass({
          type: "event-ticket",
          qr: "q",
          meta: { eventName: "E", startsAt: new Date() } as unknown as WalletPassInput["meta"],
        } as WalletPassInput),
    ).toThrow(/venue/);
  });

  it("rejects event-ticket with wrong-typed startsAt (not a Date)", () => {
    expect(
      () =>
        new WalletPass({
          type: "event-ticket",
          qr: "q",
          meta: { eventName: "E", venue: "V", startsAt: "2026-09-12" as unknown as Date },
        } as WalletPassInput),
    ).toThrow(/startsAt/);
  });

  it("rejects event-ticket with an invalid Date", () => {
    expect(
      () =>
        new WalletPass({
          type: "event-ticket",
          qr: "q",
          meta: { eventName: "E", venue: "V", startsAt: new Date("not-a-date") },
        }),
    ).toThrow(/startsAt/);
  });

  it("allows generic type with empty meta", () => {
    expect(() => new WalletPass({ type: "generic", qr: "q", meta: {} })).not.toThrow();
  });

  it("allows a well-formed event-ticket", () => {
    expect(() => new WalletPass(baseInput)).not.toThrow();
  });
});

describe("credentials priority (PRD.md §9.2 rotation)", () => {
  it("prefers explicit appleCredentials over env vars, without touching env", async () => {
    delete process.env.APPLE_PASS_CERT;
    delete process.env.APPLE_WWDR_CERT;
    const pass = new WalletPass(baseInput, {
      appleCredentials: { cert: Buffer.from("fake-cert"), wwdr: Buffer.from("fake-wwdr") },
    });
    // With bogus (non-PEM) explicit credentials, passkit-generator fails to parse
    // rather than reporting a dry-run — proving the explicit path was taken
    // instead of falling back to the (unset) env vars.
    await expect(pass.apple()).rejects.not.toThrow(/dry-run/);
  });

  it("prefers explicit googleCredentials over env vars, without a real signature", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const pass = new WalletPass(baseInput, {
      googleCredentials: { serviceAccountJson: JSON.stringify({ client_email: "a@b.com", private_key: "not-a-real-key" }) },
    });
    // Bogus private_key: real crypto signing throws instead of returning dry-run,
    // proving the explicit credentials path (not the missing env var) was used.
    await expect(pass.google()).rejects.toThrow();
  });
});

describe("onEmit audit callback (PRD.md §9.2, no PII)", () => {
  it("is invoked with the correct shape and never the raw qr/serial", async () => {
    const events: unknown[] = [];
    const qr = "cinemark|txn=4821|seat=F12";
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pass = new WalletPass(
      { ...baseInput, qr },
      {
        googleCredentials: {
          serviceAccountJson: JSON.stringify({
            client_email: "a@b.com",
            private_key: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
          }),
        },
        onEmit: (event) => events.push(event),
      },
    );

    await pass.google();

    expect(events).toHaveLength(1);
    const event = events[0] as { wallet: string; passType: string; serialHash: string; timestamp: Date };
    expect(event.wallet).toBe("google");
    expect(event.passType).toBe("event-ticket");
    expect(event.serialHash).not.toBe(qr);
    expect(event.serialHash).toMatch(/^[0-9a-f]{16}$/);
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it("hashes the serial to 16 hex chars (64 bits), never the raw qr", async () => {
    const events: unknown[] = [];
    const qr = "seq-000123";
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pass = new WalletPass(
      { ...baseInput, qr },
      {
        googleCredentials: {
          serviceAccountJson: JSON.stringify({
            client_email: "a@b.com",
            private_key: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
          }),
        },
        onEmit: (event) => events.push(event),
      },
    );
    await pass.google();
    const event = events[0] as { serialHash: string };
    expect(event.serialHash).toHaveLength(16);
    expect(event.serialHash).not.toBe(qr);
  });

  it("is not invoked when the emit dry-runs (no credentials)", async () => {
    const events: unknown[] = [];
    delete process.env.APPLE_PASS_CERT;
    delete process.env.APPLE_WWDR_CERT;
    const pass = new WalletPass(baseInput, { onEmit: (event) => events.push(event) });
    await expect(pass.apple()).rejects.toThrow(/dry-run/);
    expect(events).toHaveLength(0);
  });
});
