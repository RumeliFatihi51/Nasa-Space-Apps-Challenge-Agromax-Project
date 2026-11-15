import { setTimeout as delay } from "node:timers/promises";
import { createStore } from "../commercial/db/store";
import { workOne } from "../commercial/terra-brain/worker";

const url = process.env.AGROMAX_TERRA_BRAIN_WORKER_DATABASE_URL;
const orgs = [...new Set((process.env.AGROMAX_TERRA_BRAIN_ORGS ?? "").split(",").map(value => value.trim()).filter(Boolean))];
if (!url || !orgs.length || !orgs.every(org => /^[a-zA-Z0-9_-]{1,100}$/.test(org)))
  throw new Error("Terra Brain worker requires a database URL and explicit organization IDs.");
if (process.env.AGROMAX_TERRA_BRAIN_ENABLED !== "true")
  throw new Error("Terra Brain worker is disabled.");
process.env.AGROMAX_POSTGRES_DRIVER ||= "pg";
const store = await createStore({ url });
const signal = new AbortController();
process.once("SIGTERM", () => signal.abort());
process.once("SIGINT", () => signal.abort());
const once = process.argv.includes("--once");
let lastHeartbeat = 0;
try {
  while (!signal.signal.aborted) {
    let processed = false;
    for (const org of orgs) {
      if (signal.signal.aborted) break;
      try {
        processed = await workOne(store, org) || processed;
      } catch (error) {
        const code = (error as { code?: string }).code;
        console.error(JSON.stringify({ event: "terra.worker_error", code: code ?? "WORKER_ERROR" }));
        if (once) throw new Error("Terra Brain worker could not complete its verification pass.");
      }
    }
    if (Date.now() - lastHeartbeat >= 30_000) {
      console.info(JSON.stringify({ event: "terra.heartbeat", at: new Date().toISOString() }));
      lastHeartbeat = Date.now();
    }
    if (once) break;
    if (!processed) await delay(2000, undefined, { signal: signal.signal }).catch(error => {
      if (!signal.signal.aborted) throw error;
    });
  }
} finally {
  await store.close();
}
