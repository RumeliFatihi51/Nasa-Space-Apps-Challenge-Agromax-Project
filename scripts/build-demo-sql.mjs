import { readFile, writeFile } from "node:fs/promises";
const manifest = JSON.parse(
  await readFile("demo/agromax-demo-v1.json", "utf8"),
);
const ids = [
  ...new Set(JSON.stringify(manifest).match(/[a-f0-9]{32}/g)),
].filter((id) =>
  [
    ...manifest.records,
    ...manifest.jobs,
    ...manifest.platform,
    ...manifest.domain,
    ...manifest.reports,
    ...manifest.claims,
  ].some((row) => row.id === id),
);
const literal = JSON.stringify({ ...manifest, ids }).replaceAll("'", "''");
const sql = `-- AgroMax DEMO v1. Run application migrations before this file.
-- No customer data is overwritten. Functions are not exposed to public/anon.
BEGIN;
CREATE TABLE IF NOT EXISTS demo_templates(id TEXT PRIMARY KEY,body TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS demo_installations(user_id TEXT PRIMARY KEY,version INTEGER NOT NULL,installed_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE demo_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_installations ENABLE ROW LEVEL SECURITY;
INSERT INTO demo_templates(id,body,enabled) VALUES('agromax-demo-v1','${literal}',1)
ON CONFLICT(id) DO UPDATE SET body=excluded.body,enabled=excluded.enabled;
CREATE OR REPLACE FUNCTION agromax_install_demo(target_user_id TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $agromax$
DECLARE raw TEXT; data JSONB; entry JSONB; original_id TEXT; org TEXT; actor RECORD; stamp TEXT; record_body TEXT; record_data JSONB;
BEGIN
 SELECT * INTO actor FROM users WHERE id=target_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Existing AgroMax user required'; END IF;
 IF EXISTS(SELECT 1 FROM demo_installations WHERE user_id=target_user_id) THEN RETURN jsonb_build_object('installed',true,'alreadyInstalled',true); END IF;
 IF EXISTS(SELECT 1 FROM records WHERE user_id=target_user_id) THEN RETURN jsonb_build_object('installed',false,'reason','account_not_empty'); END IF;
 SELECT body INTO raw FROM demo_templates WHERE id='agromax-demo-v1' AND enabled=1;
 IF raw IS NULL THEN RETURN jsonb_build_object('installed',false); END IF;
 data=raw::jsonb;
 FOR original_id IN SELECT jsonb_array_elements_text(data->'ids') LOOP
   raw=replace(raw,original_id,md5('agromax-demo-v1:'||target_user_id||':'||original_id));
 END LOOP;
 data=raw::jsonb; stamp=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 org=substr(encode(sha256(convert_to('agromax:legacy-workspace:'||target_user_id,'UTF8')),'hex'),1,32);
 INSERT INTO auth_users(id,name,email,email_verified) VALUES(actor.id,actor.name,actor.email,false) ON CONFLICT(id) DO NOTHING;
 INSERT INTO organizations(id,name) VALUES(org,'AgroMax Eğitim İşletmesi') ON CONFLICT(id) DO NOTHING;
 INSERT INTO memberships(id,organization_id,user_id,role) VALUES(md5('demo-member:'||target_user_id),org,target_user_id,'owner') ON CONFLICT DO NOTHING;
 INSERT INTO user_preferences(user_id,active_organization_id) VALUES(target_user_id,org) ON CONFLICT(user_id) DO NOTHING;
 FOR entry IN SELECT * FROM jsonb_array_elements(data->'records') LOOP
   IF entry->>'kind'='task' THEN
     entry=jsonb_set(entry,'{body}',to_jsonb(jsonb_set((entry->>'body')::jsonb,'{date}',to_jsonb(to_char((now() AT TIME ZONE 'Europe/Istanbul')::date + ((right((entry->>'body')::jsonb->>'date',2))::int - 15),'YYYY-MM-DD')))::text));
   END IF;
   INSERT INTO records(id,user_id,kind,body) VALUES(entry->>'id',target_user_id,entry->>'kind',entry->>'body');
   INSERT INTO farm_records(id,user_id,kind,body) VALUES(entry->>'id',org,entry->>'kind',entry->>'body');
   IF entry->>'kind'='field' THEN
     INSERT INTO field_revisions(field_id,user_id,version,action,geometry_hash,changed_at)
       SELECT entry->>'id',target_user_id,1,'snapshot',job->>'hash',stamp FROM jsonb_array_elements(data->'jobs') job WHERE job->>'fieldId'=entry->>'id';
   END IF;
 END LOOP;
 FOR entry IN SELECT * FROM jsonb_array_elements(data->'jobs') LOOP
   INSERT INTO analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at,finished_at,result)
     VALUES(entry->>'id',target_user_id,entry->>'fieldId',entry->>'hash',entry->>'snapshot','completed',stamp,stamp,(entry->'analysis')::text);
   INSERT INTO farm_analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at,finished_at,result)
     VALUES(entry->>'id',org,entry->>'fieldId',entry->>'hash',entry->>'snapshot','completed',stamp,stamp,(entry->'analysis')::text);
   INSERT INTO analyses(field_id,geometry_hash,body) VALUES(entry->>'fieldId',entry->>'hash',(entry->'analysis')::text);
   INSERT INTO farm_analyses(field_id,geometry_hash,body) VALUES(entry->>'fieldId',entry->>'hash',(entry->'analysis')::text);
   INSERT INTO notifications(id,user_id,type,title,message,job_id,field_id,created_at)
     VALUES(md5('demo-notification:'||(entry->>'id')),target_user_id,'analysis_completed','Analiz örneği hazır','Sentetik eğitim verisi; gerçek uydu ölçümü değildir.',entry->>'id',entry->>'fieldId',stamp);
   INSERT INTO farm_notifications(id,user_id,type,title,message,job_id,field_id,created_at)
     VALUES(md5('demo-notification:'||(entry->>'id')),org,'analysis_completed','Analiz örneği hazır','Sentetik eğitim verisi; gerçek uydu ölçümü değildir.',entry->>'id',entry->>'fieldId',stamp);
 END LOOP;
 FOR entry IN SELECT * FROM jsonb_array_elements(data->'platform') LOOP
   record_data=jsonb_build_object('createdBy',target_user_id,'updatedBy',target_user_id,'payload',entry->'payload','fieldSnapshot',entry->'fieldSnapshot','review',jsonb_build_object('approval','not_approved','machineExecution',false,'demo',true));
   record_body=record_data::text;
   INSERT INTO platform_records(id,user_id,field_id,kind,name,status,version,body,created_at,updated_at)
     VALUES(entry->>'id',target_user_id,entry->>'fieldId',entry->>'kind',entry->>'name','draft',1,record_body,stamp,stamp);
   INSERT INTO farm_platform_records(id,user_id,field_id,kind,name,status,version,body,created_at,updated_at)
     VALUES(entry->>'id',org,entry->>'fieldId',entry->>'kind',entry->>'name','draft',1,record_body,stamp,stamp);
   record_data=record_data||jsonb_build_object('id',entry->>'id','fieldId',entry->>'fieldId','kind',entry->>'kind','name',entry->>'name','status','draft','version',1,'createdAt',stamp,'updatedAt',stamp);
   INSERT INTO platform_revisions(id,user_id,record_id,version,body,created_at) VALUES(md5('demo-revision:'||(entry->>'id')),target_user_id,entry->>'id',1,record_data::text,stamp);
   INSERT INTO farm_platform_revisions(id,user_id,record_id,version,body,created_at) VALUES(md5('demo-revision:'||(entry->>'id')),org,entry->>'id',1,record_data::text,stamp);
 END LOOP;
 FOR entry IN SELECT * FROM jsonb_array_elements(data->'domain') LOOP
   INSERT INTO domain_records(id,organization_id,field_id,kind,data,version,created_by,created_at,updated_at)
     VALUES(entry->>'id',org,entry->>'fieldId',entry->>'kind',entry->'data',1,target_user_id,stamp::timestamptz,stamp::timestamptz);
 END LOOP;
 FOR entry IN SELECT * FROM jsonb_array_elements(data->'claims') LOOP
   INSERT INTO analysis_claims(id,organization_id,field_id,analysis_id,geometry_version,metric,evidence,created_at)
     VALUES(entry->>'id',org,entry->>'fieldId',entry->>'analysisId',entry->>'geometryVersion',entry->>'metric',entry->'evidence',stamp::timestamptz);
 END LOOP;
 FOR entry IN SELECT * FROM jsonb_array_elements(data->'reports') LOOP
   INSERT INTO reports(id,organization_id,field_id,state,snapshot,created_by,request_key,created_at)
     VALUES(entry->>'id',org,entry->>'fieldId','queued',entry->'snapshot',target_user_id,'demo:'||(entry->>'id'),stamp::timestamptz);
 END LOOP;
 INSERT INTO demo_installations(user_id,version) VALUES(target_user_id,1);
 RETURN jsonb_build_object('installed',true,'fields',3,'analyses',3,'platformRecords',36,'domainRecords',42,'reportSnapshots',3);
END;
$agromax$;
REVOKE ALL ON FUNCTION agromax_install_demo(TEXT) FROM PUBLIC;
REVOKE ALL ON demo_templates,demo_installations FROM PUBLIC;
DO $roles$
DECLARE api_role TEXT;
BEGIN
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
     EXECUTE format('REVOKE ALL ON FUNCTION agromax_install_demo(TEXT) FROM %I',api_role);
     EXECUTE format('REVOKE ALL ON demo_templates,demo_installations FROM %I',api_role);
   END IF;
 END LOOP;
END;
$roles$;
COMMIT;
-- New empty guest accounts are seeded automatically after this installation.
-- Existing EMPTY account (SQL administrator only):
-- SELECT agromax_install_demo('EXISTING_USER_ID');
-- Disable automatic demo for future guests:
-- UPDATE demo_templates SET enabled=0 WHERE id='agromax-demo-v1';
`;
await writeFile("demo/AGROMAX_SUPABASE_DEMO.sql", sql);
console.log("Generated SQL installer; template ids:", ids.length);
