import type { Store } from "../db/store";
import { claimJob, handleJob, scoped } from "./service";

export async function workOne(store: Store, org: string, jobId?: string) {
  if (process.env.AGROMAX_TERRA_BRAIN_ENABLED === "false") return false;
  const job = await scoped(store, org, tx => claimJob(tx, org, jobId));
  if (!job) return false;
  const started = Date.now();
  const state = await handleJob(store, job);
  console.info(JSON.stringify({ event: "terra.job", jobId: job.id, kind: job.kind, state,
    attempt: job.attempts, queueMs: started - new Date(job.created_at).getTime(), durationMs: Date.now() - started }));
  return true;
}
