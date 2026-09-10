// Google Wallet REST lifecycle (PRD.md §8.2) — thin client over
// @googleapis/walletobjects for upserting an EventTicketObject: insert if
// it doesn't exist, patch if it does. Same dry-run posture as google.ts
// when GOOGLE_SERVICE_ACCOUNT_JSON is missing.
import { auth, walletobjects, type walletobjects_v1 } from "@googleapis/walletobjects";
import { sanitizeText } from "./sanitize.js";

export type EventTicketObjectClient = Pick<walletobjects_v1.Resource$Eventticketobject, "insert" | "patch" | "get">;

export interface GoogleLifecycleClientResult {
  dryRun: boolean;
  reason?: string;
  client?: EventTicketObjectClient;
}

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

/** Builds an authenticated eventticketobject client from GOOGLE_SERVICE_ACCOUNT_JSON, or a dry-run reason. */
export function createEventTicketObjectClient(): GoogleLifecycleClientResult {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return {
      dryRun: true,
      reason:
        "falta GOOGLE_SERVICE_ACCOUNT_JSON (service account JSON con scope wallet_object.issuer). Ver PRD.md §9.1.",
    };
  }

  let account: GoogleServiceAccount;
  try {
    account = JSON.parse(raw) as GoogleServiceAccount;
  } catch {
    return { dryRun: true, reason: "GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido" };
  }

  const client = new auth.JWT({
    email: account.client_email,
    key: account.private_key,
    scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
  });
  return { dryRun: false, client: walletobjects({ version: "v1", auth: client }).eventticketobject };
}

export interface EventTicketSeat {
  seat?: string;
  row?: string;
  section?: string;
  gate?: string;
}

export interface EventTicketObjectInput {
  classId: string;
  objectId: string;
  state?: "active" | "expired" | "completed" | "inactive";
  eventName?: string;
  venue?: string;
  seat?: EventTicketSeat;
  barcodeValue?: string;
}

function localizedString(value: string) {
  return { defaultValue: { language: "en", value } };
}

/** Pure mapping: lifecycle input -> Google EventTicketObject REST payload (PRD.md §7/§8.2). */
export function buildEventTicketObject(
  input: EventTicketObjectInput,
): walletobjects_v1.Schema$EventTicketObject {
  const { classId, objectId, state, eventName, venue, seat, barcodeValue } = input;
  return {
    id: objectId,
    classId,
    state: (state ?? "active").toUpperCase(),
    ...(eventName ? { ticketHolderName: sanitizeText(eventName) } : {}),
    ...(venue
      ? { textModulesData: [{ header: "Venue", body: sanitizeText(venue) }] }
      : {}),
    ...(seat
      ? {
          seatInfo: {
            ...(seat.seat ? { seat: localizedString(sanitizeText(seat.seat)) } : {}),
            ...(seat.row ? { row: localizedString(sanitizeText(seat.row)) } : {}),
            ...(seat.section ? { section: localizedString(sanitizeText(seat.section)) } : {}),
            ...(seat.gate ? { gate: localizedString(sanitizeText(seat.gate)) } : {}),
          },
        }
      : {}),
    ...(barcodeValue ? { barcode: { type: "QR_CODE", value: sanitizeText(barcodeValue) } } : {}),
  };
}

function isNotFoundError(err: unknown): boolean {
  const e = err as { code?: number | string; response?: { status?: number } } | undefined;
  return e?.code === 404 || e?.response?.status === 404;
}

/** insert if the object doesn't exist yet, patch if it does (upsert, PRD.md §8.2). */
export async function upsertEventTicketObject(
  client: EventTicketObjectClient,
  input: EventTicketObjectInput,
): Promise<walletobjects_v1.Schema$EventTicketObject> {
  const resource = buildEventTicketObject(input);
  const exists = await client
    .get({ resourceId: input.objectId })
    .then(() => true)
    .catch((err: unknown) => {
      if (isNotFoundError(err)) return false;
      throw err;
    });

  const response = exists
    ? await client.patch({ resourceId: input.objectId, requestBody: resource })
    : await client.insert({ requestBody: resource });
  return response.data;
}
