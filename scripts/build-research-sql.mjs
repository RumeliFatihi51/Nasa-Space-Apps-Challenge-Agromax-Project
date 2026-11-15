import { readFile, writeFile } from "node:fs/promises";
import { makeSampleStudy } from "../commercial/terra-brain/sample-study.ts";

const seed = JSON.parse(await readFile("demo/agromax-demo-v1.json", "utf8"));
const samples = seed.records.filter(record => record.kind === "field").map(record => {
  const parcel = JSON.parse(record.body);
  const geometryVersion = seed.jobs.find(job => job.fieldId === record.id).hash;
  return { seedId: record.id, geometry: parcel.geometry, geometryVersion,
    study: makeSampleStudy({ ...parcel, geometryVersion }, record.id) };
});
const literal = JSON.stringify(samples).replaceAll("'", "''");

await writeFile("demo/AGROMAX_SUPABASE_RESEARCH.sql", `-- Run after the application migrations and the sample workspace installer.
-- Existing sample installations only. The app also adds this study for new guests on first access.
BEGIN;
SET LOCAL search_path = agromax_launch, public;
DO $research$
DECLARE
  samples jsonb := '${literal}'::jsonb;
  guest record;
  item jsonb;
  source_id text;
  field_key text;
  revision text;
  study_text text;
  study jsonb;
  row_value jsonb;
  owner_key text;
  install_template jsonb := '${JSON.stringify([...new Set([...seed.records, ...seed.jobs, ...seed.platform, ...seed.domain, ...seed.reports, ...seed.claims].map(row => row.id))])}'::jsonb;
BEGIN
  FOR guest IN SELECT u.id FROM demo_installations i JOIN users u ON u.id=i.user_id
    WHERE u.email ~ '^guest-[a-f0-9]{32}@guest[.]agromax[.]invalid$'
  LOOP
    owner_key := substr(encode(sha256(convert_to('agromax:legacy-workspace:'||guest.id,'UTF8')),'hex'),1,32);
    UPDATE organizations SET name='AgroMax Eğitim İşletmesi'
      WHERE id=owner_key AND name='DEMO · AgroMax Eğitim İşletmesi';
    FOR source_id IN SELECT jsonb_array_elements_text(install_template) LOOP
      field_key := md5('agromax-demo-v1:'||guest.id||':'||source_id);
      UPDATE records SET body=replace(body,'DEMO · ','Örnek · ')
        WHERE user_id=guest.id AND id=field_key AND body::jsonb->'demo'='true'::jsonb AND body LIKE '%DEMO · %';
      UPDATE farm_records SET body=replace(body,'DEMO · ','Örnek · ')
        WHERE user_id=owner_key AND id=field_key AND body::jsonb->'demo'='true'::jsonb AND body LIKE '%DEMO · %';
      UPDATE analyses SET body=replace(body,'DEMO · ','Örnek · ')
        WHERE field_id=field_key AND body::jsonb->'demo'='true'::jsonb AND body LIKE '%DEMO · %';
      UPDATE farm_analyses SET body=replace(body,'DEMO · ','Örnek · ')
        WHERE field_id=field_key AND body::jsonb->'demo'='true'::jsonb AND body LIKE '%DEMO · %';
      UPDATE analysis_jobs SET result=replace(result,'DEMO · ','Örnek · '),
        snapshot=replace(snapshot,'DEMO · ','Örnek · ')
        WHERE user_id=guest.id AND id=field_key AND result::jsonb->'demo'='true'::jsonb
          AND (result LIKE '%DEMO · %' OR snapshot LIKE '%DEMO · %');
      UPDATE farm_analysis_jobs SET result=replace(result,'DEMO · ','Örnek · '),
        snapshot=replace(snapshot,'DEMO · ','Örnek · ')
        WHERE user_id=owner_key AND id=field_key AND result::jsonb->'demo'='true'::jsonb
          AND (result LIKE '%DEMO · %' OR snapshot LIKE '%DEMO · %');
      UPDATE platform_records SET name=replace(name,'DEMO · ','Örnek · '),
        body=replace(replace(body,'DEMO · ','Örnek · '),'DEMO: ','Örnek: ')
        WHERE user_id=guest.id AND id=field_key AND (name LIKE '%DEMO · %' OR body LIKE '%DEMO%');
      UPDATE farm_platform_records SET name=replace(name,'DEMO · ','Örnek · '),
        body=replace(replace(body,'DEMO · ','Örnek · '),'DEMO: ','Örnek: ')
        WHERE user_id=owner_key AND id=field_key AND (name LIKE '%DEMO · %' OR body LIKE '%DEMO%');
      UPDATE domain_records SET data=replace(data::text,'DEMO · ','Örnek · ')::jsonb
        WHERE organization_id=owner_key AND id=field_key AND data::text LIKE '%DEMO · %';
      UPDATE notifications SET title='Analiz örneği hazır'
        WHERE user_id=guest.id AND job_id=field_key AND title='DEMO · Analiz örneği hazır';
      UPDATE farm_notifications SET title='Analiz örneği hazır'
        WHERE user_id=owner_key AND job_id=field_key AND title='DEMO · Analiz örneği hazır';
    END LOOP;
    PERFORM set_config('agromax.terra_org', owner_key, true);
    FOR item IN SELECT * FROM jsonb_array_elements(samples)
    LOOP
      field_key := md5('agromax-demo-v1:'||guest.id||':'||(item->>'seedId'));
      revision := item->>'geometryVersion';
      IF NOT EXISTS(SELECT 1 FROM records r JOIN farm_records f ON f.id=r.id AND f.user_id=owner_key
        WHERE r.user_id=guest.id AND r.id=field_key AND r.kind='field' AND r.body::jsonb->'demo'='true'::jsonb
          AND r.body::jsonb->'geometry'=item->'geometry' AND r.body::jsonb->>'deletedAt' IS NULL)
        OR EXISTS(SELECT 1 FROM terra_brain.jobs WHERE org_id=owner_key AND field_id=field_key
           AND geometry_version=revision AND key LIKE 'example-water-balance-v2:%')
      THEN CONTINUE;
      END IF;
      study_text := (item->'study')::text;
      FOR source_id IN
        SELECT value->>'id' FROM jsonb_array_elements(item->'study'->'datasets')
        UNION ALL SELECT value->>'id' FROM jsonb_array_elements(item->'study'->'jobs')
      LOOP
        study_text := replace(study_text, source_id, md5(field_key||':'||source_id));
      END LOOP;
      study := study_text::jsonb;
      FOR row_value IN SELECT * FROM jsonb_array_elements(study->'datasets') LOOP
        INSERT INTO terra_brain.datasets(id,org_id,field_id,season,geometry_version,kind,digest,metadata,rows)
        VALUES(row_value->>'id',owner_key,field_key,(study->>'season')::int,revision,row_value->>'kind',
          row_value->>'digest',row_value->'metadata',row_value->'rows')
        ON CONFLICT DO NOTHING;
      END LOOP;
      FOR row_value IN SELECT * FROM jsonb_array_elements(study->'jobs') LOOP
        INSERT INTO terra_brain.jobs(id,org_id,field_id,actor_id,legacy,season,geometry_version,kind,key,request_digest,manifest,state,output,ended_at)
        VALUES(row_value->>'id',owner_key,field_key,guest.id,true,(study->>'season')::int,revision,row_value->>'kind',
          row_value->>'key',encode(sha256(convert_to((row_value->'manifest')::text,'UTF8')),'hex'),
          row_value->'manifest','succeeded',row_value->'output',now())
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END
$research$;
COMMIT;
`);
