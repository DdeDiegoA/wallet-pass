import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEventTicketObject,
  createEventTicketObjectClient,
  upsertEventTicketObject,
  type EventTicketObjectClient,
} from "./google-lifecycle.js";

describe("createEventTicketObjectClient", () => {
  beforeEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  });

  it("dry-runs without throwing when service account JSON is missing", () => {
    const result = createEventTicketObjectClient();
    expect(result.dryRun).toBe(true);
    expect(result.reason).toBeTruthy();
    expect(result.client).toBeUndefined();
  });

  it("dry-runs when the service account JSON is malformed", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "not-json";
    const result = createEventTicketObjectClient();
    expect(result.dryRun).toBe(true);
  });
});

describe("buildEventTicketObject", () => {
  it("builds the minimal object shape with default active state", () => {
    const object = buildEventTicketObject({ classId: "issuer.class1", objectId: "issuer.obj1" });
    expect(object).toEqual({ id: "issuer.obj1", classId: "issuer.class1", state: "ACTIVE" });
  });

  it("maps eventName, venue, seat, and barcode into the correct REST fields", () => {
    const object = buildEventTicketObject({
      classId: "issuer.class1",
      objectId: "issuer.obj1",
      state: "expired",
      eventName: "Premiere",
      venue: "Main Hall",
      seat: { seat: "12", row: "A", section: "1", gate: "West" },
      barcodeValue: "qr-payload",
    });

    expect(object.state).toBe("EXPIRED");
    expect(object.ticketHolderName).toBe("Premiere");
    expect(object.textModulesData).toEqual([{ header: "Venue", body: "Main Hall" }]);
    expect(object.seatInfo).toEqual({
      seat: { defaultValue: { language: "en", value: "12" } },
      row: { defaultValue: { language: "en", value: "A" } },
      section: { defaultValue: { language: "en", value: "1" } },
      gate: { defaultValue: { language: "en", value: "West" } },
    });
    expect(object.barcode).toEqual({ type: "QR_CODE", value: "qr-payload" });
  });

  it("sanitizes control characters in free-text fields", () => {
    const object = buildEventTicketObject({
      classId: "issuer.class1",
      objectId: "issuer.obj1",
      eventName: "Bad\x00Name",
    });
    expect(object.ticketHolderName).toBe("BadName");
  });
});

describe("upsertEventTicketObject", () => {
  function notFoundError() {
    return Object.assign(new Error("not found"), { code: 404 });
  }

  function fakeClient(overrides: Partial<EventTicketObjectClient> = {}): EventTicketObjectClient {
    return {
      get: vi.fn().mockRejectedValue(notFoundError()),
      insert: vi.fn().mockResolvedValue({ data: { id: "issuer.obj1" } }),
      patch: vi.fn().mockResolvedValue({ data: { id: "issuer.obj1" } }),
      ...overrides,
    } as unknown as EventTicketObjectClient;
  }

  it("calls insert with the built payload when the object doesn't exist (get rejects with 404)", async () => {
    const client = fakeClient();
    await upsertEventTicketObject(client, { classId: "issuer.class1", objectId: "issuer.obj1", eventName: "Premiere" });

    expect(client.get).toHaveBeenCalledWith({ resourceId: "issuer.obj1" });
    expect(client.insert).toHaveBeenCalledWith({
      requestBody: { id: "issuer.obj1", classId: "issuer.class1", state: "ACTIVE", ticketHolderName: "Premiere" },
    });
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("calls patch with the built payload when the object already exists (get resolves)", async () => {
    const client = fakeClient({ get: vi.fn().mockResolvedValue({ data: { id: "issuer.obj1" } }) });
    await upsertEventTicketObject(client, { classId: "issuer.class1", objectId: "issuer.obj1", venue: "Main Hall" });

    expect(client.patch).toHaveBeenCalledWith({
      resourceId: "issuer.obj1",
      requestBody: { id: "issuer.obj1", classId: "issuer.class1", state: "ACTIVE", textModulesData: [{ header: "Venue", body: "Main Hall" }] },
    });
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("rethrows a generic error (e.g. 500) from get instead of silently falling back to insert", async () => {
    const client = fakeClient({ get: vi.fn().mockRejectedValue(Object.assign(new Error("internal error"), { code: 500 })) });

    await expect(
      upsertEventTicketObject(client, { classId: "issuer.class1", objectId: "issuer.obj1" }),
    ).rejects.toThrow("internal error");
    expect(client.insert).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("treats a 404 reported via response.status (gaxios shape) as not-found too", async () => {
    const client = fakeClient({ get: vi.fn().mockRejectedValue(Object.assign(new Error("not found"), { response: { status: 404 } })) });

    await upsertEventTicketObject(client, { classId: "issuer.class1", objectId: "issuer.obj1" });
    expect(client.insert).toHaveBeenCalled();
  });
});
