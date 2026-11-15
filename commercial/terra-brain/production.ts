import { readFile } from "node:fs/promises";
import type { Store } from "../db/store";
import { workOne } from "./worker";

const prepared = new WeakMap<Store, Promise<void>>();
// Additive, explicitly enabled pilot installation using the deployed SQL source.
// Never run the full application migration set from a request.
export async function prepareTerraPilot(store: Store) {
  if (process.env.AGROMAX_TERRA_BRAIN_BOOTSTRAP !== "true") return;
  let pending = prepared.get(store);
  if (!pending) {
    pending = store.transaction(async tx => {
      await tx.query("select pg_advisory_xact_lock(721934609)");
      const row = (await tx.query("select to_regclass('terra_brain.datasets') as datasets, to_regclass('terra_brain.jobs') as jobs, to_regclass('terra_brain.events') as events")).rows[0]!;
      const found = [row.datasets, row.jobs, row.events].filter(Boolean).length;
      if (found === 3) return;
      if (found !== 0) throw new Error("Terra Brain schema is incomplete; manual migration review required.");
      const sql = await readFile("commercial/db/migrations/0009_terra_brain.sql", "utf8");
      for (const statement of sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean))
        await tx.query(statement);
    });
    prepared.set(store, pending);
    pending.catch(() => prepared.delete(store));
  }
  await pending;
}

// Small, bounded FAO-56 pilot jobs only. SQL leases prevent duplicate publication.
// Status polling redispatches interrupted jobs once their lease expires.
export async function dispatchTerraPilot(store: Store, org: string, jobId: string) {
  try { await workOne(store, org, jobId); }
  catch (error) {
    console.error(JSON.stringify({ event: "terra.dispatch_error", jobId,
      code: (error as {code?: string}).code || "WORKER_ERROR" }));
  }
}
