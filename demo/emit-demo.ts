// End-to-end demo: cinema ticket through WalletPass DSL (PRD.md Fase 4).
// No Apple/Google credentials in this environment -> apple()/google() throw
// a dry-run error by design (spike emitters signal missing creds via throw,
// not a return value). We catch it and log {dryRun, reason} so the flow's
// success criterion is "ran end-to-end without crashing", not "has real creds".
import { WalletPass } from "../src/index.js";

const pass = new WalletPass(
  {
    type: "event-ticket",
    qr: "DEMO-QR-PAYLOAD-0001",
    meta: {
      eventName: "Dune: Parte Tres",
      venue: "Cinemark Centro",
      startsAt: new Date("2026-10-15T20:00:00Z"),
      organizationName: "Cinemark",
    },
    holder: { seat: "F12", ticketId: "TCK-9921" },
  },
  {
    onEmit: (event) => console.log("[audit] onEmit:", event),
  },
);

async function run(wallet: "apple" | "google", fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    console.log(`[${wallet}] emitted:`, result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`[${wallet}]`, { dryRun: true, reason });
  }
}

await run("apple", () => pass.apple());
await run("google", () => pass.google());
