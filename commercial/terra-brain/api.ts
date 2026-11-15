import { makeSampleStudy, sampleSeason, seedSampleStudy } from "./sample-study";
import { z } from "zod";
import { identifier } from "../../shared/contracts/commercial";
import { validateGeometry } from "../../shared/geometry.js";
import { DomainError } from "../core/errors";
import type { WorkspaceRequest } from "../core/api";
import { requirePermission } from "../organizations/service";
import { openApi } from "./openapi";
import type { ClaimEvidence } from "../intelligence/claims";
import { fingerprint, importInput, parseImport, prepareBalance, prepareForecast, runInput, seasonInput } from "./kernel";
import { cancelJob, datasets, enqueue, loadDataset, loadJob, publicJob, scoped, verifyScope,
  type Job, type JobRequest, type Scope } from "./service";

const prefix = "/api/v1/terra-brain";
const jobPath = /^\/jobs\/([a-f0-9]{32})(?:\/(cancel|report))?$/;
const fieldPath = /^\/fields\/([a-zA-Z0-9_-]{1,100})\/(imports|observations|twin|runs|forecasts|research|jobs|demo-balance)$/;
const keyInput = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const headers = { "Cache-Control": "private, no-store" };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
const seasonQuery = z.string().regex(/^\d{4}$/).transform(Number).pipe(seasonInput);
const pageSize = z.coerce.number().int().min(1).max(50);
export function terraEnabled(org: string, guest = false) {
  if (process.env.AGROMAX_TERRA_BRAIN_ENABLED === "false") return false;
  const allowed = new Set((process.env.AGROMAX_TERRA_BRAIN_ORGS || "").split(",").map(id => id.trim()).filter(Boolean));
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    return process.env.AGROMAX_TERRA_BRAIN_ENABLED === "true" && (allowed.has(org) || (guest && process.env.AGROMAX_TERRA_BRAIN_DEMO === "true"));
  return !allowed.size || allowed.has(org);
}
function reference(job: Job, scope: Scope, season: number, geometryVersion: string): asserts job is Extract<Job, {kind: "water_balance" | "replay"}> {
  if (job.field_id !== scope.field || job.season !== season || job.geometry_version !== geometryVersion ||
    job.state !== "succeeded" || (job.kind !== "water_balance" && job.kind !== "replay"))
    throw new DomainError("RUN_NOT_AVAILABLE", "Bu parsel, sezon ve sınır için tamamlanmış su dengesi bulunamadı.", 404);
}
export async function terraRoutes({ context, path, method, body, options, request, url }: WorkspaceRequest) {
  if (!path.startsWith(prefix + "/")) return;
  const org = context.organization.id;
  requirePermission(context, "read");
  if (path === prefix + "/status" && method === "GET")
    return reply({ enabled: terraEnabled(org, context.actor.guest), pilot: "trakya-winter-wheat",
      scientificStatus: "unvalidated_pilot", forecast: "research_only",
      operations: ["import", "water_balance", "evaluation", "replay", "forecast", "research"] });
  if (path === prefix + "/openapi.json" && method === "GET") return reply(openApi());
  if (!terraEnabled(org, context.actor.guest))
    throw new DomainError("TERRA_DISABLED", "Terra Brain bu işletmede henüz etkin değil.", 403);
  const route = path.slice(prefix.length);
  const field = route.match(fieldPath);
  const directJob = route.match(jobPath);
  if (!field && !directJob) throw new DomainError("NOT_FOUND", "Araştırma yolu bulunamadı.", 404);
  const makeScope = (field: string): Scope => ({
    org, field, actor: context.actor.id, legacy: context.actor.authentication === "legacy-session",
  });

  if (directJob) {
    const [, id, action] = directJob;
    const cancel = action === "cancel" && method === "POST";
    if (!cancel && !(method === "GET" && action !== "cancel"))
      throw new DomainError("METHOD_NOT_ALLOWED", "İşlem bu yöntemle çağrılamaz.", 405);
    if (cancel) requirePermission(context, "record.write");
    return scoped(options.store, org, async tx => {
      const job = await loadJob(tx, org, id!, cancel);
      await verifyScope(tx, makeScope(job.field_id), undefined, cancel);
      if (cancel) return reply({ job: publicJob(await cancelJob(tx, job)) });
      if (action === "report") {
        if (job.state !== "succeeded" || job.kind === "import")
          throw new DomainError("REPORT_NOT_READY", "Araştırma çıktısı henüz hazır değil.", 409);
        const report = { schemaVersion: 1, job: publicJob(job, true), manifest: job.manifest,
          digest: fingerprint({ id: job.id, manifest: job.manifest, output: job.output }) };
        return Response.json(report, { headers: {
          ...headers, "Content-Disposition": `attachment; filename="terra-${job.id}-v1.json"`,
        } });
      }
      return reply({ job: publicJob(job, true) });
    });
  }

  const [, fieldId, segment] = field!;
  const scope = makeScope(fieldId!);
  if (method === "POST" && (segment === "imports" || segment === "runs")) {
    requirePermission(context, segment === "imports" || context.actor.authentication === "legacy-session" ? "record.write" : "calculate");
    const input = segment === "imports" ? importInput.parse(body) : runInput.parse(body);
    const dryRun = segment === "imports" && url.searchParams.get("dryRun") === "true";
    const key = dryRun ? null : keyInput.parse(request.headers.get("Idempotency-Key"));
    const digest = fingerprint({ fieldId, segment, input });
    const imported = "csv" in input ? parseImport(input) : null;
    return scoped(options.store, org, async tx => {
      const current = await verifyScope(tx, scope, input.geometryVersion, true);
      if (current.demo) throw new DomainError("DEMO_READ_ONLY", "Saha araştırması için kendi parselini seç.", 422);
      if (dryRun && imported) return reply({ kind: imported.kind, rowCount: imported.rows.length,
        digest: imported.digest, metadata: imported.metadata });
      let payload: JobRequest;
      if (imported) payload = { kind: "import", manifest: imported };
      else if ("csv" in input) throw new Error("Import manifest unavailable.");
      else if (input.kind === "water_balance") {
        const { season, geometryVersion: revision } = input;
        const sources = await Promise.all([
          loadDataset(tx, scope, season, revision, input.soilId, "soil"),
          loadDataset(tx, scope, season, revision, input.weatherId, "weather"),
          ...(input.irrigationId ? [loadDataset(tx, scope, season, revision, input.irrigationId, "irrigation")] : []),
        ]);
        const areaM2 = validateGeometry(current.geometry).area * 1000;
        payload = { kind: input.kind, manifest: prepareBalance(input, sources, areaM2, new Date().toISOString()) };
      } else if (input.kind === "research") {
        if (input.runId) reference(await loadJob(tx, org, input.runId), scope, input.season, input.geometryVersion);
        const latest = (await tx.query(`select distinct on (kind) id,kind,digest,metadata from terra_brain.datasets
          where org_id=$1 and field_id=$2 and season=$3 and geometry_version=$4 order by kind,created_at desc,id desc`,
          [org, scope.field, input.season, input.geometryVersion])).rows as unknown as import("./kernel").DatasetReference[];
        const claims = (await tx.query(`select distinct on (metric) id,metric,evidence,analysis_id from analysis_claims
          where organization_id=$1 and field_id=$2 and geometry_version=$3 and evidence->>'verification'='observational'
          and evidence->'range'->>'from' >= $4 and evidence->'range'->>'to' < $5
          order by metric,evidence->>'observedAt' desc,id desc limit 8`,
          [org, scope.field, input.geometryVersion, input.season + "-07-01", (input.season + 1) + "-09-01"]))
          .rows as unknown as {id: string; metric: string; evidence: ClaimEvidence; analysis_id: string}[];
        payload = { kind: "research", manifest: { baseId: input.runId ?? null, sources: latest,
          analysisId: claims[0]?.analysis_id ?? null,
          claims: claims.map(({id, metric, evidence}) => ({id, metric, evidence})) } };
      } else {
        const base = await loadJob(tx, org, input.runId);
        reference(base, scope, input.season, input.geometryVersion);
        const result = (base.output as ReturnType<typeof import("./kernel").computeBalance>).result;
        if (input.kind === "replay") payload = { kind: input.kind, manifest: { ...base.manifest, replayOf: base.id } };
        else if (input.kind === "forecast") {
          const source = await loadDataset(tx, scope, input.season, input.geometryVersion, input.weatherId, "forecast_weather");
          payload = { kind: "forecast", manifest: prepareForecast(base.id, base.manifest, result, source, input.future) };
        }
        else {
          const source = await loadDataset(tx, scope, input.season, input.geometryVersion, input.moistureId, "moisture");
          payload = { kind: "evaluation", manifest: { baseId: base.id, balance: base.manifest,
            result, moisture: source, scenarioName: input.scenarioName } };
        }
      }
      const job = await enqueue(tx, scope, input.season, input.geometryVersion, key!, digest, payload);
      return reply({ job: publicJob(job) }, 202);
    });
  }
  if (segment === "demo-balance" && method === "GET") {
    return scoped(options.store, org, async tx => {
      const parcel = await verifyScope(tx, scope);
      if (!parcel.demo) throw new DomainError("NOT_FOUND", "Örnek parsel bulunamadı.", 404);
      const depth = z.coerce.number().int().min(0).max(80).optional().parse(url.searchParams.get("irrigation") ?? undefined);
      const study = makeSampleStudy(parcel, scope.field, depth);
      return reply({ ...study.output, irrigation: study.irrigation, season: study.season });
    });
  }

  if (method !== "GET" || segment === "imports")
    throw new DomainError("METHOD_NOT_ALLOWED", "İşlem bu yöntemle çağrılamaz.", 405);
  const seasonParam = url.searchParams.get("season");
  const season = segment === "twin" && seasonParam === null ? null : seasonQuery.parse(seasonParam);
  const limit = pageSize.parse(url.searchParams.get("limit") ?? 20);
  const cursor = identifier.optional().parse(url.searchParams.get("cursor") ?? undefined);

  return scoped(options.store, org, async tx => {
    const current = await verifyScope(tx, scope);
    const revision = current.geometryVersion;
    if (current.demo && (season === sampleSeason || season === null) && ["observations", "twin", "runs", "jobs"].includes(segment!)) {
      const prior = await tx.query("select 1 from terra_brain.jobs where org_id=$1 and field_id=$2 and season=$3 and geometry_version=$4 and key like 'example-water-balance-v2:%' limit 1",
        [org, scope.field, sampleSeason, revision]);
      if (!prior.rows.length) await seedSampleStudy(tx, scope, current);
    }
    const data = { geometryVersion: revision, season };
    if (segment === "observations") {
      const rows = await datasets(tx, scope, season!, revision, limit + 1, cursor);
      return reply({ ...data, observations: rows.slice(0, limit),
        nextCursor: rows.length > limit ? rows[limit - 1]!.id : null });
    }
    const kinds = segment === "research" ? ["research"] : segment === "forecasts" ? ["forecast"] :
      segment === "twin" ? ["water_balance", "replay"] : segment === "runs" ? ["water_balance", "replay", "evaluation", "forecast", "research"] :
        ["import", "water_balance", "replay", "evaluation", "forecast", "research"];
    const columns = segment === "twin" || segment === "forecasts" ? "*" :
      "id,field_id,geometry_version,season,kind,state,attempts,created_at,ended_at,error";
    const rows = (await tx.query(`select ${columns} from terra_brain.jobs where org_id=$1 and field_id=$2
      and ($3::integer is null or season=$3) and (kind=any($4::text[])) and ($5::text is null or
      (created_at,id)<(select created_at,id from terra_brain.jobs where org_id=$1 and field_id=$2 and season=$3 and id=$5))
      and (not $6::boolean or (state='succeeded' and geometry_version=$7))
      order by created_at desc,id desc limit $8`, [org, scope.field, season, kinds, cursor ?? null,
      segment === "twin", revision, segment === "twin" ? 1 : limit + 1])).rows as unknown as Job[];
    if (segment === "twin") return reply({ ...data, twin: rows[0] ? publicJob(rows[0], true) : null });
    if (segment === "forecasts") return reply({ ...data, status: "research_only",
      forecasts: rows.slice(0, limit).map(row => publicJob(row, true)),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null });
    return reply({ ...data, jobs: rows.slice(0, limit).map(row => publicJob(row)),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null });
  });
}
