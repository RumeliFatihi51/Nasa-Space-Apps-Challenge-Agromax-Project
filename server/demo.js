import { readFile } from "node:fs/promises";
import { isGuestEmail } from "../shared/guest.js";
export async function seedGuestDemo(db, user) {
  if (!isGuestEmail(user.email)) return;
  if (!user.inTransaction && db.dialect === "postgres")
    return db.transaction(tx => seedGuestDemo(tx, {...user, inTransaction:true}));
  const template = await db
    .prepare("SELECT enabled FROM demo_templates WHERE id='agromax-demo-v1'")
    .get();
  if (!template?.enabled) return;
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM records WHERE user_id=?")
    .get(user.id);
  if (Number(count.count)) return;
  if (db.dialect !== "postgres") return db.prepare("SELECT agromax_install_demo(?) AS result").get(user.id);
  await db.exec("SAVEPOINT agromax_demo_seed");
  try {
    await db.prepare("SELECT agromax_install_demo(?) AS result").get(user.id);
  } catch (error) {
    await db.exec("ROLLBACK TO SAVEPOINT agromax_demo_seed");
    console.error("Demo seed failed", { code: error.code, relation: error.message?.match(/relation "([a-z_]+)" does not exist/)?.[1] });
  } finally {
    await db.exec("RELEASE SAVEPOINT agromax_demo_seed");
  }
}

export async function installLinkedDemo(db) {
  const sql = await readFile("demo/AGROMAX_SUPABASE_DEMO.sql", "utf8");
  await db.transaction(async (tx) => {
    await tx.exec("SELECT pg_advisory_xact_lock(721934602)");
    await tx.exec(await readFile("commercial/db/migrations/0008_platform_history.sql","utf8"));
    const installed = await tx.prepare(
      "SELECT 1 FROM demo_templates WHERE id='agromax-demo-v1-schema-v2'",
    ).get();
    if (installed) return;
    await tx.exec(sql.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")
      .replace("SET search_path=public,pg_temp", "SET search_path FROM CURRENT"));
    await tx.exec("INSERT INTO demo_templates(id,body,enabled) VALUES('agromax-demo-v1-schema-v2','{}',0)");
  });
}
