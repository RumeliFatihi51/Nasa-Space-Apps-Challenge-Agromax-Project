import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { sqliteDatabase, initializeDatabase } from './database.js';
import { createAnalysisService, geometryHash } from './analysis-jobs.js';
import { createPlatformService } from './platform.js';
import { createApplication } from './application.js';
import { fieldConsistency } from './field-consistency.js';
import { scenarioTotals, parseDraft } from '../shared/platform-contracts.js';
const fieldId='a'.repeat(32),otherField='b'.repeat(32);
const geometry={type:'Polygon',coordinates:[[[27.5,38.5],[27.501,38.5],[27.501,38.501],[27.5,38.501],[27.5,38.5]]]};
const payload={waterM3:10,waterUnitCost:2,fertilizerKg:0,fertilizerUnitCost:3,laborHours:2,laborHourlyCost:100,otherCost:0,currency:'TRY',assumptions:'Explicit isolated test'};
const draft=()=>({fieldId,kind:'scenario',name:'Test scenario',payload});
const flightDraft=()=>({fieldId,kind:'flight_plan',name:'Explicit isolated flight',payload:{
 geometryHash:geometryHash(geometry),firmware:'px4',vehicle:'quad',firmwareVersion:'',home:[27.5001,38.5001],homeAMSL:120,
 altitude:35,speed:5,endurance:20,swath:15,overlap:20,bearing:0,target:{kind:'field'},
}});
async function fixture() {
 const db=sqliteDatabase(new DatabaseSync(':memory:'));await initializeDatabase(db);await createAnalysisService(db,{configured:()=>false});
 await db.prepare('INSERT INTO records(id,user_id,kind,body) VALUES(?,?,?,?)').run(fieldId,'alice','field',JSON.stringify({name:'Fixture field',area:3,crop:'Wheat',geometry}));
 await db.prepare('INSERT INTO records(id,user_id,kind,body) VALUES(?,?,?,?)').run(otherField,'bob','field',JSON.stringify({name:'Other owner field',area:3}));
 return {db,service:await createPlatformService(db)};
}
test('QGC files enforce owner, geometry, revision, source and flight-only export',async()=>{
 const {db,service}=await fixture();
 const route=async(userId,path)=>{
   let status,data;const headers={};
   await service.routes({req:{url:'/api/platform/'+path,method:'GET'},body:{},session:{id:userId},
     reply:(code,body)=>{status=code;data=body;},res:{setHeader:(key,value)=>{headers[key]=value;}}});
   return {status,data,headers};
 };
 try {
   const input=flightDraft();
   await assert.rejects(service.save('bob',input),{status:404});
   await assert.rejects(service.save('alice',{...input,payload:{...input.payload,geometryHash:'0'.repeat(64)}}),{status:409});
   await assert.rejects(service.save('alice',{...input,payload:{...input.payload,target:{kind:'prescription',recordId:'c'.repeat(32),version:1,zoneIndex:0}}}),{status:404});
   const saved=await service.save('alice',input),path=`records/${saved.id}/qgc-plan`;
   assert.equal(saved.review.fileCanExecute,true);assert.equal(saved.review.actuation,'none');assert.equal(saved.review.deviceVerified,false);
   assert.equal((await route('bob',path+'?version=1')).status,404);
   assert.equal((await route('alice',path+'?version=2')).status,409);
   const download=await route('alice',path+'?version=1');
   assert.equal(download.status,200);assert.equal(download.data.fileType,'Plan');
   assert.match(download.headers['Content-Disposition'],/v1\.plan/);
   assert.equal(download.headers['Cache-Control'],'private, no-store');
   assert.ok(download.data.mission.items.every(item=>[16,21,22,178].includes(item.command)));
   await db.prepare('UPDATE records SET body=? WHERE id=?').run(JSON.stringify({name:'Demo fixture',geometry,demo:true}),fieldId);
   const demoDownload=await route('alice',path+'?version=1');
   assert.equal(demoDownload.status,200);
   assert.equal(demoDownload.data.fileType,'Plan');
   assert.match(demoDownload.headers['Content-Disposition'],/agromax-ORNEK-/);
   assert.equal((await route('bob',path+'?version=1')).status,404);
   await db.prepare('UPDATE records SET body=? WHERE id=?').run(JSON.stringify({name:'Fixture field',geometry}),fieldId);
   const recipe=await service.save('alice',{fieldId,kind:'prescription',name:'Fixture region',payload:{application:'irrigation',rate:20,unit:'m3/ha',scope:'Fixture only',zones:[{name:'Region',rate:20,geometry}]}});
   const targeted=await service.save('alice',{...input,payload:{...input.payload,target:{kind:'prescription',recordId:recipe.id,version:1,zoneIndex:0}}});
   assert.equal(targeted.payload.target.version,1);
   const analysisId='c'.repeat(32);
   const target={kind:'analysis_review',analysisId,date:'2026-10-20',metric:'NDVI',geometry};
   await assert.rejects(service.save('alice',{...input,payload:{...input.payload,target}}),{status:422});
   await db.prepare('INSERT INTO analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at,result) VALUES(?,?,?,?,?,?,?,?)').run(analysisId,'alice',fieldId,geometryHash(geometry),'{}','completed','2026-10-20',JSON.stringify({scenes:[{properties:{datetime:'2026-10-20T09:00:00Z'}}],observations:[{from:'2026-10-20',to:'2026-10-21',stats:{NDVI:{mean:.5}}}]}));
   assert.equal((await service.save('alice',{...input,payload:{...input.payload,target}})).kind,'flight_plan');
   await assert.rejects(service.save('alice',{...input,payload:{...input.payload,target:{...target,metric:'invented'}}}),{status:422});
   await assert.rejects(service.save('alice',{...input,payload:{...input.payload,target:{...target,geometry:{type:'Polygon',coordinates:[[[0,0],[.001,0],[.001,.001],[0,.001],[0,0]]]}}}}),/dışına/);
   await service.save('alice',{...input,name:'Edited',version:1},saved.id);
   assert.equal((await route('alice',path+'?version=1')).status,409);
   await db.prepare('UPDATE records SET body=? WHERE id=?').run(JSON.stringify({name:'Changed field',geometry:null}),fieldId);
   assert.equal((await route('alice',path+'?version=2')).status,409);
 } finally {await db.close();}
});
test('platform files enforce account and field ownership; reload preserves data and optimistic revisions',async()=>{
 const {db,service}=await fixture();try{
 await assert.rejects(service.save('bob',draft()),{status:404});
 await assert.rejects(service.save('alice',{...draft(),fieldId:otherField}),{status:404});
 const saved=await service.save('alice',draft());assert.equal(saved.version,1);assert.equal(saved.calculation.totalMinor,22000);assert.equal(saved.review.approval,'not_approved');
 const restarted=await createPlatformService(db);assert.equal((await restarted.records('alice',fieldId))[0].id,saved.id);
 await assert.rejects(service.save('bob',{...draft(),version:1},saved.id),{status:404});
 const changed=await service.save('alice',{...draft(),version:1,name:'Changed'},saved.id);assert.equal(changed.version,2);
 await assert.rejects(service.save('alice',{...draft(),version:1},saved.id),{status:409});
 const rows=await db.prepare('SELECT version,body FROM platform_revisions WHERE record_id=? ORDER BY version').all(saved.id);assert.deepEqual(rows.map(r=>r.version),[1,2]);assert.equal(JSON.parse(rows[0].body).name,'Test scenario');
 }finally{await db.close();}
});
test('cost arithmetic preserves zero and currency, rejects impossible or injected payloads and cannot approve a prescription',()=>{
 assert.equal(scenarioTotals({...payload,waterM3:0,laborHours:0}).totalMinor,0);
 assert.equal(scenarioTotals({...payload,currency:'EUR'}).currency,'EUR');
 assert.throws(()=>scenarioTotals({...payload,waterM3:-1}));assert.throws(()=>scenarioTotals({...payload,waterM3:1e8,waterUnitCost:1e8}));
 assert.throws(()=>parseDraft({...draft(),status:'approved'}));
 assert.throws(()=>parseDraft({...draft(),payload:{...payload,predictedYield:500}}));
 assert.throws(()=>parseDraft({...draft(),kind:'prescription',payload:{application:'irrigation',unit:'kg/ha',rate:10,scope:'Test'}}));
});
test('scenario calculations round exact decimals and report sourced revenue sensitivity', () => {
  const result = scenarioTotals({ ...payload, waterM3: 1, waterUnitCost: 1.005,
    energyKwh: 0.5, energyUnitCost: 0.03, equipmentHours: 1, equipmentHourlyCost: 5,
    revenue: { quantityKg: 20, unitPrice: 20, source: 'Isolated input', sensitivityPercent: 10 } });
  assert.equal(result.lines.water, 101);
  assert.equal(result.lines.energy, 2);
  assert.equal(result.lines.equipment, 500);
  assert.equal(result.totalMinor, 20603);
  assert.deepEqual(result.revenue, { source: 'Isolated input', grossMinor: 40000, netMinor: 19397,
    lowNetMinor: 15397, highNetMinor: 23397, sensitivityPercent: 10 });
});
test('consistency flags incompatible sensors, dates, missing bands and stale files with their references', () => {
  const hash = geometryHash(geometry);
  const id = 'e'.repeat(32);
  const issues = fieldConsistency({ id: fieldId, geometry }, hash, [{ state:'failed', id }], [{
    id, analysis: { provider:'earth-search', method:'s2-c1-cog-scl-v1', availableMetrics:['NDVI','VV'],
      range:{ from:'2026-10-01', split:'2026-10-15', to:'2026-10-30' },
      observations:[{ from:'2026-09-30', to:'2026-10-02' }] }
  }, { id:'old', analysis:{ provider:'cdse', method:'s2-l2a-v3' } }], [{
    id:'old-file', status:'draft', kind:'scenario', fieldSnapshot:{ geometryHash:'old' },
  }]);
  assert.deepEqual(issues.map(issue=>issue.code).sort(), [
    'analysis_failed','method_changed','missing_bands','observation_date_conflict','outdated_files','sensor_metric_mismatch',
  ]);
  const mismatch = issues.find(issue=>issue.code==='sensor_metric_mismatch');
  assert.equal(mismatch.reference,id);
  assert.equal(mismatch.level,'critical');
});

test('investigations preserve the linked analysis and reject another parcel or invalid field location', async () => {
  const { db, service } = await fixture();
  try {
    const analysisId = 'd'.repeat(32);
    const input = { fieldId, kind: 'investigation', name: 'Isolated visit',
      payload: { priority: 'normal', region: 'North', requestedData: 'Record soil reading',
        state: 'closed', visitedAt: '2026-10-20', result: 'Checked on site',
        analysisId, coordinate: [27.5005, 38.5005],
        measurement: { device: 'Test sensor', metric: 'soilMoisture', value: 0 } } };
    await assert.rejects(service.save('alice', input), { status: 404 });
    await db.prepare('INSERT INTO analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at,result) VALUES(?,?,?,?,?,?,?,?)')
      .run(analysisId, 'alice', fieldId, geometryHash(geometry), '{}', 'completed', '2026-10-20T00:00:00Z', '{}');
    await assert.rejects(service.save('alice', { ...input, payload: { ...input.payload, coordinate: [28, 38] } }), { status: 400 });
    await assert.rejects(service.save('alice', { ...input, payload: { ...input.payload, result: undefined } }), { status: 400 });
    const saved = await service.save('alice', input);
    assert.equal(saved.payload.analysisId, analysisId);
    assert.equal(saved.payload.measurement.value, 0);
    assert.equal((await service.records('alice', fieldId))[0].payload.state, 'closed');
  } finally { await db.close(); }
});
test('context uses current geometry, reports real gaps and does not invent evidence or causal results',async()=>{
 const {db,service}=await fixture();try{
 let context=await service.fieldContext('alice',fieldId);assert.equal(context.latestAnalysis,null);assert.equal(context.comparison.length,0);assert.ok(context.issues.some(i=>i.code==='observation_missing'));
 const result={source:'EXPLICIT TEST SOURCE',method:'test',fetchedAt:'2026-10-20T00:00:00Z',range:{from:'2026-09-01',split:'2026-10-01',to:'2026-11-01'},observations:[{},{}],comparison:{NDVI:{previous:{mean:0.3},current:{mean:0.5}},NDWI:{previous:null,current:{mean:0}}}};
 await db.prepare('INSERT INTO analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at,result) VALUES(?,?,?,?,?,?,?,?)').run('c'.repeat(32),'alice',fieldId,geometryHash(geometry),'{}','completed','2026-10-20T00:00:00Z',JSON.stringify(result));
 context=await service.fieldContext('alice',fieldId);assert.equal(context.comparison.length,1);assert.ok(Math.abs(context.comparison[0].delta-0.2)<1e-10);assert.equal(context.comparison[0].currentCoverage,null);
 await db.prepare('UPDATE records SET body=? WHERE id=?').run(JSON.stringify({name:'Edited',area:4,geometry:null}),fieldId);
 context=await service.fieldContext('alice',fieldId);assert.equal(context.latestAnalysis,null);assert.equal(context.comparison.length,0);assert.ok(context.issues.some(i=>i.code==='geometry_changed'));assert.equal(context.history[0].comparable,false);
 const bundle=await service.bundle('alice',fieldId);const {integrity,...content}=bundle;assert.equal(integrity.digest,createHash('sha256').update(JSON.stringify(content)).digest('hex'));assert.equal(bundle.certified,false);assert.equal(bundle.machineExecution,false);
 }finally{await db.close();}
});
test('platform HTTP endpoints require sessions, retain private versions, and return only review exports',async()=>{
 const db=sqliteDatabase(new DatabaseSync(':memory:'));const app=await createApplication({db});const server=http.createServer(app.handle);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,{cookie,body,method}={})=>fetch(base+'/api/'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
 assert.equal((await request('platform/bootstrap')).status,401);
 const register=await request('register',{body:{name:'Isolated test',email:'platform-test@example.invalid',password:'isolated-platform-123'}});const cookie=register.headers.get('set-cookie').split(';')[0];
 const bootstrap=await(await request('platform/bootstrap',{cookie})).json();assert.equal(bootstrap.features.length,14);assert.equal(bootstrap.capabilities.machinePrescription,false);assert.equal(bootstrap.sources.find(s=>s.id==='landsat').state,'planned');
 const f=await(await request('records',{cookie,body:{kind:'field',name:'Isolated field',area:3}})).json();
 const fieldPath = `records/${f.id}`;
 const edit = await request(fieldPath,{cookie,method:'PATCH',body:{version:1,sowingDate:'2026-10-12'}});
 assert.equal(edit.status, 200);
 assert.equal((await edit.json()).sowingDate, '2026-10-12');
 assert.equal((await request(fieldPath,{cookie,method:'PATCH',body:{version:1,name:'Old revision'}})).status, 409);
 const removed = await (await request(fieldPath,{cookie,method:'DELETE',body:{version:2}})).json();
 assert.equal(removed.version, 3);
 const restored = await (await request(fieldPath+'/restore',{cookie,body:{version:removed.version}})).json();
 assert.equal(restored.sowingDate, '2026-10-12');
 assert.equal(restored.version, 4);
 const { revisions } = await (await request(fieldPath+'/revisions',{cookie})).json();
 assert.deepEqual(revisions.map(row=>[row.version,row.action]), [[4,'restore'],[3,'delete'],[2,'update'],[1,'snapshot']]);
 const saved=await(await request('platform/records',{cookie,body:{...draft(),fieldId:f.id}})).json();assert.equal(saved.record.version,1);
 const exportResponse=await request(`platform/records/${saved.record.id}/export`,{cookie});assert.equal(exportResponse.status,200);assert.match(exportResponse.headers.get('content-disposition'),/attachment/);assert.equal((await exportResponse.json()).machineExecution,false);
 assert.equal((await request(`platform/records/${saved.record.id}`,{cookie,method:'PATCH',body:{...draft(),fieldId:f.id,version:99}})).status,409);
 assert.equal((await request(`platform/records/${saved.record.id}`,{cookie,method:'PATCH',body:{...draft(),fieldId:f.id,version:1,status:'approved'}})).status,400);
 assert.equal((await(await request(`platform/records/${saved.record.id}/revisions`,{cookie})).json()).revisions.length,1);
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
});

test('Architect revisions retain the owned analysis and linked plan version', async () => {
  const {db,service}=await fixture();
  try {
    const analysisId='9'.repeat(32), hash=geometryHash(geometry);
    const makeDay=(date,mean)=>({from:date+'T00:00:00Z',to:new Date(Date.parse(date)+86400000).toISOString(),stats:{NDVI:{mean}}});
    const dates=['2026-10-20','2026-10-22'];
    const analysis={source:'Test Sentinel 2',provider:'cdse',method:'s2-l2a-v3',scenes:dates.map(date=>({properties:{datetime:date+'T09:00:00Z'}})),observations:dates.map((date,i)=>makeDay(date,.4+i*.1))};
    await db.prepare("INSERT INTO analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at,result) VALUES(?,?,?,?,?,?,?,?)")
      .run(analysisId,'alice',fieldId,hash,'{}','completed','2026-10-23T10:00:00Z',JSON.stringify(analysis));
    const scenario=await service.save('alice',draft());
    const project={fieldId,kind:'architect_project',name:'Review block',payload:{geometryHash:hash,metric:'NDVI',
      primary:{analysisId,date:dates[1]},comparison:{analysisId,date:dates[0]},mode:'compare',opacity:.7,notes:'Version one',
      pins:[{label:'Inspect',coordinate:[27.5004,38.5004]}],references:[{id:scenario.id,version:scenario.version,kind:'scenario'}]}};
    await assert.rejects(service.save('bob',project),{status:404});
    await assert.rejects(service.save('alice',{...project,payload:{...project.payload,pins:[{label:'Outside',coordinate:[0,0]}]}}),{status:422});
    await assert.rejects(service.save('alice',{...project,payload:{...project.payload,metric:'NDMI'}}),{status:422});
    await assert.rejects(service.save('alice',{...project,payload:{...project.payload,references:[{id:scenario.id,version:99,kind:'scenario'}]}}),{status:422});
    const record=await service.save('alice',project);
    await service.save('alice',{...draft(),version:1,name:'New plan'},scenario.id);
    const changed=await service.save('alice',{...project,version:1,payload:{...project.payload,notes:'Version two'}},record.id);
    assert.equal(changed.version,2);
    assert.equal(changed.payload.references[0].version,1);
    await assert.rejects(service.save('alice',{...project,version:1},record.id),{status:409});
    const history=await db.prepare('SELECT body FROM platform_revisions WHERE record_id=? ORDER BY version').all(record.id);
    assert.deepEqual(history.map(row=>JSON.parse(row.body).payload.notes),['Version one','Version two']);
  } finally { await db.close(); }
});
