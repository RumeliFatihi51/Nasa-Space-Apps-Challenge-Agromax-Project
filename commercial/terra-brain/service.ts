import type { Store, SqlClient } from "../db/store";
import { uid } from "../organizations/service";
import { DomainError } from "../core/errors";
import { geometryHash } from "../../server/analysis-jobs.js";
import type { ClaimEvidence } from "../intelligence/claims";
import type { BalanceManifest, BalanceResult, Dataset, DatasetReference, ForecastManifest, Imported } from "./kernel";
import { computeBalance, computeForecast, evaluateBalance } from "./kernel";

type JobKind = JobRequest["kind"];
type State = "queued" | "running" | "succeeded" | "failed" | "canceled";
type EvaluationManifest = { baseId: string; balance: BalanceManifest; result: BalanceResult; moisture: Dataset; scenarioName: string };
type ResearchManifest = { baseId: string | null; sources: DatasetReference[]; analysisId: string | null;
  claims: { id: string; metric: string; evidence: ClaimEvidence }[] };
export type JobRequest = { kind: "import"; manifest: Imported } |
  { kind: "water_balance"; manifest: BalanceManifest } |
  { kind: "replay"; manifest: BalanceManifest & { replayOf: string } } |
  { kind: "forecast"; manifest: ForecastManifest } |
  { kind: "evaluation"; manifest: EvaluationManifest } |
  { kind: "research"; manifest: ResearchManifest };
export type Job = {
  id: string; org_id: string; field_id: string; actor_id: string; legacy: boolean;
  season: number; geometry_version: string; state: State; attempts: number;
  attempt_id: string | null; request_digest: string; created_at: Date | string; ended_at: Date | string | null;
  output: Record<string, unknown> | null; error: { code: string; message: string } | null;
} & JobRequest;
export type Scope = { org: string; field: string; actor: string; legacy: boolean };
export function scoped<T>(store: Store, org: string, work: (tx: SqlClient) => Promise<T>) {
  return store.transaction(async tx => {
    await tx.query("select set_config('agromax.terra_org',$1,true)", [org]);
    return work(tx);
  });
}

export async function verifyScope(tx: SqlClient, scope: Scope, revision?: string, writable = false, actorMustBeWriter = writable) {
  const membership = (await tx.query(
    `select role from memberships where organization_id=$1 and user_id=$2${writable ? " for share" : ""}`,
    [scope.org, scope.actor])).rows[0];
  if (!membership || actorMustBeWriter && !["owner", "manager", "worker"].includes(String(membership.role)))
    throw new DomainError("FORBIDDEN", "Araştırma erişimi bulunamadı.", 403);
  const [table, owner] = scope.legacy ? ["records", scope.actor] : ["farm_records", scope.org];
  const row = (await tx.query(
    `select body from ${table} where id=$1 and user_id=$2 and kind='field'${writable ? " for share" : ""}`,
    [scope.field, owner])).rows[0];
  const field = row && JSON.parse(String(row.body));
  if (!field || field.deletedAt) throw new DomainError("NOT_FOUND", "Parsel bulunamadı.", 404);
  const geometryVersion = geometryHash(field.geometry);
  if (revision !== undefined && (!field.geometry || geometryVersion !== revision))
    throw new DomainError("GEOMETRY_CHANGED", "Parsel sınırı değişti. Güncel sınırla tekrar dene.", 409);
  return { ...field, geometryVersion } as { name: string; geometry: unknown; geometryVersion: string; demo?: boolean; location?: string };
}

export async function datasets(tx: SqlClient, scope: Scope, season: number, revision: string, limit: number, cursor?: string) {
  return (await tx.query(`select id, kind, digest, metadata, jsonb_array_length(rows) as "rowCount", created_at from terra_brain.datasets
    where org_id=$1 and field_id=$2 and season=$3 and geometry_version=$4
    and ($6::text is null or (created_at,id) < (select created_at,id from terra_brain.datasets
      where org_id=$1 and field_id=$2 and season=$3 and geometry_version=$4 and id=$6))
    order by created_at desc,id desc limit $5`, [scope.org, scope.field, season, revision, limit, cursor ?? null]))
    .rows as unknown as (Omit<Dataset, "rows"> & { created_at: Date | string; rowCount: number })[];
}
export async function loadDataset(tx: SqlClient, scope: Scope, season: number, revision: string, id: string, kind: Imported["kind"]) {
  const row = (await tx.query(`select id,kind,digest,metadata,rows from terra_brain.datasets
    where org_id=$1 and field_id=$2 and season=$3 and geometry_version=$4 and id=$5 and kind=$6`,
    [scope.org, scope.field, season, revision, id, kind])).rows[0] as unknown as Dataset | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "Veri sürümü bu parsel, sezon ve sınır için bulunamadı.", 404);
  return row;
}
export async function loadJob(tx: SqlClient, org: string, id: string, lock = false) {
  const row = (await tx.query(`select * from terra_brain.jobs where org_id=$1 and id=$2${lock ? " for update" : ""}`, [org, id])).rows[0];
  if (!row) throw new DomainError("NOT_FOUND", "Çalışma bulunamadı.", 404);
  return row as unknown as Job;
}
export function publicJob(job: Job, full = false) {
  const sources = !full ? [] : job.kind === "water_balance" || job.kind === "replay" ? job.manifest.sources :
    job.kind === "evaluation" ? [job.manifest.moisture, ...job.manifest.balance.sources] :
      job.kind === "forecast" ? [job.manifest.future, ...job.manifest.balance.sources] :
      job.kind === "research" ? job.manifest.sources : [];
  return { id: job.id, fieldId: job.field_id, geometryVersion: job.geometry_version, season: job.season,
    kind: job.kind, state: job.state, attempts: job.attempts, createdAt: job.created_at, endedAt: job.ended_at,
    error: job.error, ...(full ? { result: job.output,
      sources: sources.map(({id, digest, kind, metadata}) => ({id, digest, kind, metadata})) } : {}) };
}
export async function enqueue(tx: SqlClient, scope: Scope, season: number, revision: string,
  key: string, digest: string, payload: JobRequest) {
  await tx.query("select id from organizations where id=$1 for update", [scope.org]);
  const previous = (await tx.query("select * from terra_brain.jobs where org_id=$1 and key=$2",
    [scope.org, key])).rows[0] as unknown as Job | undefined;
  if (previous) {
    if (previous.request_digest !== digest)
      throw new DomainError("IDEMPOTENCY_CONFLICT", "Bu istek anahtarı farklı içerikle kullanılmış.", 409);
    return previous;
  }
  const count = (await tx.query("select count(*) as count from terra_brain.jobs where org_id=$1 and state in ('queued','running')",
    [scope.org])).rows[0]?.count;
  if (Number(count) >= 20) throw new DomainError("QUEUE_FULL", "İşletmenin bekleyen iş sınırı doldu.", 429);
  const row = (await tx.query(`insert into terra_brain.jobs
    (id,org_id,field_id,actor_id,legacy,season,geometry_version,kind,key,request_digest,manifest)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) returning *`,
    [uid(), scope.org, scope.field, scope.actor, scope.legacy, season, revision,
      payload.kind, key, digest, JSON.stringify(payload.manifest)])).rows[0];
  await appendEvent(tx, row as unknown as Job, "job.queued");
  return row as unknown as Job;
}
export async function cancelJob(tx: SqlClient, job: Job) {
  if (job.state === "canceled") return job;
  if (!["queued", "running"].includes(job.state))
    throw new DomainError("JOB_ENDED", "Tamamlanmış çalışma iptal edilemez.", 409);
  const row = (await tx.query(`update terra_brain.jobs set state='canceled',ended_at=now(),lease_until=null,attempt_id=null
    where org_id=$1 and id=$2 returning *`, [job.org_id, job.id])).rows[0] as unknown as Job;
  await appendEvent(tx, row, "job.canceled");
  return row;
}
async function appendEvent(tx: SqlClient, job: Job, kind: string) {
  await tx.query("insert into terra_brain.events(id,org_id,job_id,kind) values($1,$2,$3,$4) on conflict do nothing",
    [uid(), job.org_id, job.id, kind]);
}
async function notifyCompletion(tx: SqlClient, job: Job) {
  const [table, owner] = job.legacy ? ["notifications", job.actor_id] : ["farm_notifications", job.org_id];
  await tx.query(`insert into ${table}(id,user_id,type,title,message,job_id,field_id,created_at)
    values($1,$2,'terra_brain',$3,$4,$1,$5,$6) on conflict(id) do nothing`,
  [job.id, owner, "Araştırma işi tamamlandı", job.kind === "import" ?
    "Saha verisi araştırmaya eklendi." : "Araştırma sonucu incelemeye hazır.", job.field_id, new Date().toISOString()]);
}
export async function claimJob(tx: SqlClient, org: string, jobId?: string) {
  await tx.query("select pg_advisory_xact_lock(hashtext($1))", ["terra-queue:" + org]);
  const ended = (await tx.query(`update terra_brain.jobs set state='failed',ended_at=now(),lease_until=null,
    error='{"code":"LEASE_EXHAUSTED","message":"İş deneme sınırına ulaştı."}'::jsonb
    where org_id=$1 and state='running' and lease_until<=now() and attempts>=3 returning *`, [org])).rows;
  for (const row of ended) await appendEvent(tx, row as unknown as Job, "job.failed");
  if ((await tx.query("select id from terra_brain.jobs where org_id=$1 and state='running' and lease_until>now() limit 2",[org])).rows.length >= 2)
    return null;
  const row = (await tx.query(`with candidate as (
    select id from terra_brain.jobs where org_id=$1 and ($3::text is null or id=$3) and attempts<3 and
      ((state='queued' and available_at<=now()) or (state='running' and lease_until<=now()))
    order by available_at,id limit 1 for update skip locked
  ) update terra_brain.jobs j set state='running',attempts=j.attempts+1,attempt_id=$2,
    lease_until=now()+interval '2 minutes' from candidate where j.id=candidate.id returning j.*`, [org, uid(), jobId ?? null])).rows[0];
  return row as unknown as Job | undefined;
}
const jobScope = (job: Job): Scope => ({
  org: job.org_id, field: job.field_id, actor: job.actor_id, legacy: job.legacy,
});

async function publishImport(tx: SqlClient, job: Job, value: Imported) {
  const values = [job.org_id, job.field_id, job.season, job.geometry_version, value.digest];
  const id = uid();
  await tx.query(`insert into terra_brain.datasets(id,org_id,field_id,season,geometry_version,digest,kind,metadata,rows)
    values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
    on conflict(org_id,field_id,geometry_version,season,digest) do nothing`,
  [id, ...values, value.kind, JSON.stringify(value.metadata), JSON.stringify(value.rows)]);
  const row = (await tx.query(`select id from terra_brain.datasets
    where org_id=$1 and field_id=$2 and season=$3 and geometry_version=$4 and digest=$5`, values)).rows[0]!;
  return { kind: value.kind, datasetId: row.id, rowCount: value.rows.length, verification: "accepted" };
}
export function calculateJob(job: Job): Record<string, unknown> {
  if (job.kind === "import") return {};
  if (job.kind === "evaluation")
    return evaluateBalance(job.manifest.balance, job.manifest.result, job.manifest.moisture.rows, job.manifest.scenarioName);
  if (job.kind === "forecast") return computeForecast(job.manifest);
  if (job.kind === "research") {
    const available = job.manifest.sources.map(source => source.kind);
    const missing = (["soil", "weather", "irrigation", "moisture"] as const).filter(kind => !available.includes(kind));
    const questions = [
      ...(!job.manifest.claims.length ? ["Sezon içinde kalite eşiğini geçen bir uydu değişim kaydı var mı?"] : []),
      ...(missing.includes("weather") ? ["Değişim döneminde ne kadar yağış ve atmosferik su talebi vardı?"] : []),
      ...(missing.includes("irrigation") ? ["Aynı dönemin sulama tarihleri ve miktarları doğrulanabilir mi?"] : []),
      ...(missing.includes("moisture") ? ["Aynı gün için kök bölgesinin tamamında nem ölçümü var mı?"] : []),
    ];
    return { kind: "research", missing, analysisId: job.manifest.analysisId,
      runId: job.manifest.baseId, sources: job.manifest.sources.map(({id, kind, digest}) => ({id, kind, digest})),
      claims: job.manifest.claims, questions,
      limitations: "Uydu değişimi parsel gözlemidir. Hava ve sulama kayıtları tek başına değişimin nedenini doğrulamaz.",
      verification: missing.length ? "needs_data" : "needs_review" };
  }
  return { ...computeBalance(job.manifest), ...(job.kind === "replay" && { replayOf: job.manifest.replayOf }) };
}
export async function handleJob(store: Store, job: Job) {
  let result: Record<string, unknown>;
  try {
    await scoped(store, job.org_id, tx => verifyScope(tx, jobScope(job), job.geometry_version, false, true));
    result = calculateJob(job);
  } catch (error) {
    return failJob(store, job, error);
  }
  try {
    return await scoped(store, job.org_id, async tx => {
      const latest = await loadJob(tx, job.org_id, job.id, true);
      if (latest.state !== "running" || latest.attempt_id !== job.attempt_id) return "superseded";
      const active = (await tx.query(`select id from terra_brain.jobs where org_id=$1 and id=$2 and lease_until>now()`,
        [job.org_id, job.id])).rows[0];
      if (!active) return "superseded";
      await verifyScope(tx, jobScope(job), job.geometry_version, true);
      if (job.kind === "import") result = await publishImport(tx, job, job.manifest);
      const published = (await tx.query(`update terra_brain.jobs set state='succeeded',ended_at=now(),lease_until=null,
        output=$3::jsonb,error=null where org_id=$1 and id=$2 and lease_until>clock_timestamp() returning id`,
      [job.org_id,job.id,JSON.stringify(result)])).rows[0];
      if (!published) throw new DomainError("LEASE_EXPIRED", "Görev sahipliği sona erdi.", 503);
      await appendEvent(tx, job, job.kind === "import" ? "observation.accepted" : "run.completed");
      await notifyCompletion(tx, job);
      return "succeeded";
    });
  } catch (error) {
    return failJob(store, job, error);
  }
}
async function failJob(store: Store, job: Job, error: unknown) {
  const code = error instanceof DomainError ? error.code : "WORKER_ERROR";
  const message = error instanceof DomainError ? error.message : "Çalışma hesaplanamadı.";
  const retryable = error instanceof DomainError ? error.status >= 500 :
    ["40001","40P01","57P01","ECONNRESET","ETIMEDOUT"].includes(String((error as {code?: string})?.code));
  return scoped(store, job.org_id, async tx => {
    const retry = retryable && job.attempts < 3;
    const state = retry ? "queued" : "failed";
    const row = (await tx.query(`update terra_brain.jobs set state=$4,error=$5::jsonb,attempt_id=null,lease_until=null,
      available_at=now()+$6::integer*interval '1 second',ended_at=case when $4='failed' then now() else null end
      where org_id=$1 and id=$2 and attempt_id=$3 and state='running' and lease_until>now() returning id`,
    [job.org_id,job.id,job.attempt_id,state,JSON.stringify({code,message}),20*2**(job.attempts-1)])).rows[0];
    if (row && !retry) await appendEvent(tx, job, "job.failed");
    return row ? state : "superseded";
  });
}
