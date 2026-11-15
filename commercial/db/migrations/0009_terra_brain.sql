CREATE UNIQUE INDEX IF NOT EXISTS "terra_farm_record_org_idx" ON "farm_records" ("user_id", "id");
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "terra_brain";
--> statement-breakpoint
REVOKE ALL ON SCHEMA "terra_brain" FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE "terra_brain"."datasets" (
  "id" text PRIMARY KEY,
  "org_id" text NOT NULL,
  "field_id" text NOT NULL,
  "season" integer NOT NULL,
  "geometry_version" text NOT NULL,
  "kind" text NOT NULL CHECK (kind IN ('soil','weather','forecast_weather','irrigation','moisture')),
  "digest" text NOT NULL,
  "metadata" jsonb NOT NULL,
  "rows" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("org_id", "field_id") REFERENCES "farm_records" ("user_id", "id"),
  UNIQUE ("org_id", "field_id", "geometry_version", "season", "digest")
);
--> statement-breakpoint
CREATE INDEX "terra_datasets_field_idx" ON "terra_brain"."datasets" ("org_id", "field_id", "season", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE TABLE "terra_brain"."jobs" (
  "id" text PRIMARY KEY,
  "org_id" text NOT NULL,
  "field_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "legacy" boolean NOT NULL,
  "season" integer NOT NULL,
  "geometry_version" text NOT NULL,
  "kind" text NOT NULL CHECK (kind IN ('import','water_balance','forecast','evaluation','research','replay')),
  "key" text NOT NULL,
  "request_digest" text NOT NULL,
  "manifest" jsonb NOT NULL,
  "state" text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','canceled')),
  "attempts" integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  "attempt_id" text,
  "lease_until" timestamptz,
  "available_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  "output" jsonb,
  "error" jsonb,
  FOREIGN KEY ("org_id", "field_id") REFERENCES "farm_records" ("user_id", "id"),
  UNIQUE ("org_id", "key"),
  UNIQUE ("org_id", "id")
);
--> statement-breakpoint
CREATE INDEX "terra_pending_jobs_idx" ON "terra_brain"."jobs" ("org_id", "available_at", "id") WHERE "state" IN ('queued','running');
--> statement-breakpoint
CREATE INDEX "terra_jobs_field_idx" ON "terra_brain"."jobs" ("org_id", "field_id", "season", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE TABLE "terra_brain"."events" (
  "id" text PRIMARY KEY,
  "org_id" text NOT NULL,
  "job_id" text NOT NULL,
  "kind" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("org_id", "job_id") REFERENCES "terra_brain"."jobs" ("org_id", "id"),
  UNIQUE ("job_id", "kind")
);
--> statement-breakpoint
ALTER TABLE "terra_brain"."datasets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "terra_brain"."jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "terra_brain"."events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "terra_brain"."datasets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "terra_brain"."jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "terra_brain"."events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "terra_dataset_tenant" ON "terra_brain"."datasets" USING (org_id = current_setting('agromax.terra_org', true)) WITH CHECK (org_id = current_setting('agromax.terra_org', true));
--> statement-breakpoint
CREATE POLICY "terra_job_tenant" ON "terra_brain"."jobs" USING (org_id = current_setting('agromax.terra_org', true)) WITH CHECK (org_id = current_setting('agromax.terra_org', true));
--> statement-breakpoint
CREATE POLICY "terra_event_tenant" ON "terra_brain"."events" USING (org_id = current_setting('agromax.terra_org', true)) WITH CHECK (org_id = current_setting('agromax.terra_org', true));
