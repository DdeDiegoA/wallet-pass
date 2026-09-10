import { describe, expect, it } from "vitest";
import {
  getLatestPass,
  getSerialsForDevice,
  logErrors,
  parseApplePassAuthToken,
  registerDevice,
  registrationKey,
  unregisterDevice,
  type RegistrationRecord,
} from "./apple-webservice.js";

const EXPECTED_TOKEN = "secret-token-123";

function authHeader(token: string) {
  return `ApplePass ${token}`;
}

describe("parseApplePassAuthToken", () => {
  it("extracts the token after the ApplePass prefix", () => {
    expect(parseApplePassAuthToken("ApplePass abc")).toBe("abc");
  });

  it("rejects a header missing the ApplePass prefix", () => {
    expect(parseApplePassAuthToken("Bearer abc")).toBeNull();
  });

  it("rejects an absent header", () => {
    expect(parseApplePassAuthToken(undefined)).toBeNull();
  });
});

describe("registerDevice", () => {
  it("rejects requests without a valid Authorization header", async () => {
    const storage = new Map<string, RegistrationRecord>();
    const result = await registerDevice({
      authorizationHeader: "Bearer nope",
      expectedAuthToken: EXPECTED_TOKEN,
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      serial: "s1",
      pushToken: "push1",
      storage,
    });
    expect(result.status).toBe(401);
    expect(storage.size).toBe(0);
  });

  it("creates a new registration (201) and stores it", async () => {
    const storage = new Map<string, RegistrationRecord>();
    const result = await registerDevice({
      authorizationHeader: authHeader(EXPECTED_TOKEN),
      expectedAuthToken: EXPECTED_TOKEN,
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      serial: "s1",
      pushToken: "push1",
      storage,
    });
    expect(result.status).toBe(201);
    expect(storage.get(registrationKey("dev1", "pass.example", "s1"))?.pushToken).toBe("push1");
  });

  it("returns 200 when the device is already registered", async () => {
    const storage = new Map<string, RegistrationRecord>();
    const opts = {
      authorizationHeader: authHeader(EXPECTED_TOKEN),
      expectedAuthToken: EXPECTED_TOKEN,
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      serial: "s1",
      pushToken: "push1",
      storage,
    };
    await registerDevice(opts);
    const second = await registerDevice(opts);
    expect(second.status).toBe(200);
  });
});

describe("unregisterDevice", () => {
  it("rejects without a valid Authorization header", async () => {
    const storage = new Map<string, RegistrationRecord>();
    const result = await unregisterDevice({
      authorizationHeader: undefined,
      expectedAuthToken: EXPECTED_TOKEN,
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      serial: "s1",
      storage,
    });
    expect(result.status).toBe(401);
  });

  it("returns 404 when no registration exists", async () => {
    const storage = new Map<string, RegistrationRecord>();
    const result = await unregisterDevice({
      authorizationHeader: authHeader(EXPECTED_TOKEN),
      expectedAuthToken: EXPECTED_TOKEN,
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      serial: "s1",
      storage,
    });
    expect(result.status).toBe(404);
  });

  it("deletes an existing registration and returns 200", async () => {
    const storage = new Map<string, RegistrationRecord>();
    const key = registrationKey("dev1", "pass.example", "s1");
    storage.set(key, { deviceLibraryId: "dev1", passTypeId: "pass.example", serial: "s1", pushToken: "p", updatedAt: 1 });

    const result = await unregisterDevice({
      authorizationHeader: authHeader(EXPECTED_TOKEN),
      expectedAuthToken: EXPECTED_TOKEN,
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      serial: "s1",
      storage,
    });
    expect(result.status).toBe(200);
    expect(storage.has(key)).toBe(false);
  });
});

describe("getSerialsForDevice", () => {
  function seedStorage() {
    const storage = new Map<string, RegistrationRecord>();
    storage.set(registrationKey("dev1", "pass.example", "s1"), {
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      serial: "s1",
      pushToken: "p1",
      updatedAt: 1000,
    });
    storage.set(registrationKey("dev1", "pass.example", "s2"), {
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      serial: "s2",
      pushToken: "p2",
      updatedAt: 2000,
    });
    storage.set(registrationKey("dev2", "pass.example", "s3"), {
      deviceLibraryId: "dev2",
      passTypeId: "pass.example",
      serial: "s3",
      pushToken: "p3",
      updatedAt: 3000,
    });
    return storage;
  }

  it("rejects without a valid Authorization header", async () => {
    const result = await getSerialsForDevice({
      authorizationHeader: "nope",
      expectedAuthToken: EXPECTED_TOKEN,
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      storage: seedStorage(),
    });
    expect(result.status).toBe(401);
  });

  it("returns only serials for the matching device+passType, with lastUpdated", async () => {
    const result = await getSerialsForDevice({
      authorizationHeader: authHeader(EXPECTED_TOKEN),
      expectedAuthToken: EXPECTED_TOKEN,
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      storage: seedStorage(),
    });
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.serialNumbers.sort()).toEqual(["s1", "s2"]);
      expect(result.lastUpdated).toBe(new Date(2000).toISOString());
    }
  });

  it("filters by passesUpdatedSince and returns 204 when nothing matches", async () => {
    const result = await getSerialsForDevice({
      authorizationHeader: authHeader(EXPECTED_TOKEN),
      expectedAuthToken: EXPECTED_TOKEN,
      deviceLibraryId: "dev1",
      passTypeId: "pass.example",
      passesUpdatedSince: new Date(2000),
      storage: seedStorage(),
    });
    expect(result.status).toBe(204);
  });
});

describe("getLatestPass", () => {
  it("returns null without a valid Authorization header", async () => {
    const result = await getLatestPass({
      authorizationHeader: "nope",
      expectedAuthToken: EXPECTED_TOKEN,
      passTypeId: "pass.example",
      serial: "s1",
      loadPass: () => undefined,
    });
    expect(result).toBeNull();
  });

  it("returns null when the pass is unknown to the loader", async () => {
    const result = await getLatestPass({
      authorizationHeader: authHeader(EXPECTED_TOKEN),
      expectedAuthToken: EXPECTED_TOKEN,
      passTypeId: "pass.example",
      serial: "s1",
      loadPass: () => undefined,
    });
    expect(result).toBeNull();
  });

  it("returns null (not modified) when updatedAt is not after ifModifiedSince", async () => {
    const result = await getLatestPass({
      authorizationHeader: authHeader(EXPECTED_TOKEN),
      expectedAuthToken: EXPECTED_TOKEN,
      passTypeId: "pass.example",
      serial: "s1",
      ifModifiedSince: new Date(5000),
      loadPass: () => ({
        input: { type: "generic", qr: "q", meta: {} },
        updatedAt: new Date(4000),
      }),
    });
    expect(result).toBeNull();
  });
});

describe("logErrors", () => {
  it("forwards entries to the injected sink", () => {
    let captured: string[] = [];
    logErrors(["boom", "again"], (entries) => {
      captured = entries;
    });
    expect(captured).toEqual(["boom", "again"]);
  });
});
