import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../db/store";
import { prepareTerraPilot } from "./production";
import { terraEnabled } from "./api";

test("explicit production rollout and additive pilot schema installation", async () => {
  const names = ["VERCEL", "AGROMAX_TERRA_BRAIN_ENABLED", "AGROMAX_TERRA_BRAIN_ORGS", "AGROMAX_TERRA_BRAIN_BOOTSTRAP", "AGROMAX_TERRA_BRAIN_DEMO"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const store = await createStore({migrate:true}); // isolated in-memory PostgreSQL only
  try {
    process.env.VERCEL = "1";
    process.env.AGROMAX_TERRA_BRAIN_ENABLED = "true";
    process.env.AGROMAX_TERRA_BRAIN_ORGS = "pilot-a";
    assert.equal(terraEnabled("pilot-a"), true);
    assert.equal(terraEnabled("other"), false);
    process.env.AGROMAX_TERRA_BRAIN_DEMO = "true";
    assert.equal(terraEnabled("other", true), true);
    process.env.AGROMAX_TERRA_BRAIN_ENABLED = "false";
    assert.equal(terraEnabled("other"), false);
    process.env.AGROMAX_TERRA_BRAIN_BOOTSTRAP = "true";
    await store.raw.query("drop schema terra_brain cascade");
    await Promise.all([prepareTerraPilot(store), prepareTerraPilot(store)]);
    const tables = await store.raw.query("select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='terra_brain' and relkind='r'");
    assert.equal(tables.rows.length, 3);
    assert.ok(tables.rows.every(row=>row.relrowsecurity && row.relforcerowsecurity));
    await prepareTerraPilot(store);
  } finally {
    for(const name of names) {if(previous[name] === undefined) delete process.env[name];else process.env[name] = previous[name];}
    await store.close();
  }
});
