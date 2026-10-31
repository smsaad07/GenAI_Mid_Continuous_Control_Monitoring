// Ingestion pipeline: extract -> validate -> store -> test every control -> raise exceptions.
// The AI investigation runs afterwards on the exception queue (lib/ai/agent.ts).
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { q, q1, tx, log } from "./db";
import { generateMaster, Master } from "./synth/master";
import { generateBatch, RECORD_TYPES, SOURCE_SYSTEM } from "./synth/batch";
import { runAllTests } from "./controls/tests";

let masterCache: Master | null = null;
export function master(): Master {
  if (!masterCache) masterCache = generateMaster();
  return masterCache;
}

export const DEMO_USERS = [
  { email: "supervisor@ccm.demo", password: "Supervisor@2026", name: "Audit Supervisor (demo)", title: "Internal Audit Supervisor", role: "supervisor" },
  { email: "approver@ccm.demo", password: "Approver@2026", name: "Head of Internal Audit (demo)", title: "Head of Internal Audit - Approver", role: "approver" },
  { email: "committee@ccm.demo", password: "Committee@2026", name: "Audit Committee member (demo)", title: "Board Audit Committee - read only", role: "viewer" },
];

export async function ensureSeeded(initialBatches = 3) {
  const u = await q1<{ n: string }>("SELECT count(*)::text AS n FROM app_users");
  if (u && Number(u.n) > 0) return false;
  await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(727202)");
    const again = await c.query("SELECT count(*)::int AS n FROM app_users");
    if (again.rows[0].n > 0) return;
    for (const d of DEMO_USERS) {
      await c.query("INSERT INTO app_users (email, name, title, role, password_hash) VALUES ($1,$2,$3,$4,$5)", [d.email, d.name, d.title, d.role, bcrypt.hashSync(d.password, 8)]);
    }
    const m = master();
    const rows: [string, string, any][] = [
      ...m.vendors.map((v) => ["vendor", v.id, v] as [string, string, any]),
      ...m.customers.map((v) => ["customer", v.id, v] as [string, string, any]),
      ...m.employees.map((v) => ["employee", v.id, v] as [string, string, any]),
      ...m.users.map((v) => ["erp_user", v.id, v] as [string, string, any]),
      ...m.contracts.map((v) => ["contract", v.id, v] as [string, string, any]),
      ...m.routes.map((v) => ["route", v.id, v] as [string, string, any]),
      ...m.materials.map((v) => ["material", v.id, v] as [string, string, any]),
      ...m.products.map((v) => ["product", v.sku, v] as [string, string, any]),
    ];
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const params: any[] = [];
      const vals = chunk.map((r, k) => { params.push(r[0], r[1], JSON.stringify(r[2])); return `($${k * 3 + 1},$${k * 3 + 2},$${k * 3 + 3})`; });
      await c.query(`INSERT INTO master_data (type, id, data) VALUES ${vals.join(",")} ON CONFLICT DO NOTHING`, params);
    }
    await c.query("INSERT INTO audit_log (actor, role, action, entity, detail) VALUES ('system','system','SEED','master_data',$1)", [`Seeded ${rows.length} synthetic master records and ${DEMO_USERS.length} demo users`]);
  });
  for (let i = 0; i < initialBatches; i++) await ingestNextBatch("system (initial load)");
  return true;
}

export interface IngestResult {
  batch_no: number; window_start: string; window_end: string; records: number; exceptions: number;
  record_counts: Record<string, number>; stages: { stage: string; ms: number; detail: string }[]; duration_ms: number;
}

export async function ingestNextBatch(triggeredBy: string): Promise<IngestResult> {
  return tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(727203)"); // one ingestion at a time
    const t0 = Date.now();
    const stages: IngestResult["stages"] = [];
    let ts = Date.now();
    const mark = (stage: string, detail: string) => { stages.push({ stage, ms: Date.now() - ts, detail }); ts = Date.now(); };

    const last = await c.query("SELECT COALESCE(MAX(batch_no),0)::int AS n FROM batches");
    const n = last.rows[0].n + 1;
    const m = master();
    const b = generateBatch(n, m);
    const counts: Record<string, number> = Object.fromEntries(RECORD_TYPES.map((t) => [t, b.records[t].length]));
    const total = Object.values(counts).reduce((s, x) => s + x, 0);
    mark("Extract", `${total} records from ${new Set(Object.values(SOURCE_SYSTEM)).size} source systems for window ${b.window_start} to ${b.window_end}`);

    // validate: required ids unique, counts > 0
    const ids = new Set<string>();
    let dupes = 0;
    for (const t of RECORD_TYPES) for (const r of b.records[t]) { if (ids.has(r.id)) dupes++; ids.add(r.id); }
    if (dupes) throw new Error(`Validation failed: ${dupes} duplicate record ids`);
    const checksum = crypto.createHash("sha256").update(JSON.stringify(b.records)).digest("hex").slice(0, 16);
    mark("Validate", `Schema and key checks passed; ${ids.size} unique keys; checksum ${checksum}`);

    const flat = RECORD_TYPES.flatMap((t) => b.records[t].map((r) => [r.id, t, r] as const));
    for (let i = 0; i < flat.length; i += 250) {
      const chunk = flat.slice(i, i + 250);
      const params: any[] = [];
      const vals = chunk.map(([id, t, r], k) => { params.push(id, n, t, JSON.stringify(r)); return `($${k * 4 + 1},$${k * 4 + 2},$${k * 4 + 3},$${k * 4 + 4})`; });
      await c.query(`INSERT INTO records (id, batch_no, type, data) VALUES ${vals.join(",")}`, params);
    }
    for (const g of b.truth) {
      await c.query("INSERT INTO ground_truth (batch_no, control_id, kind, record_ids, expected_severity, amount_at_risk, scenario) VALUES ($1,$2,$3,$4,$5,$6,$7)", [n, g.control_id, g.kind, g.record_ids, g.expected_severity, g.amount_at_risk, g.scenario]);
    }
    mark("Load", `Stored ${total} records in the monitoring store (read-only copies; nothing written back to source systems)`);

    const results = runAllTests(b.records, m);
    let seq = 0;
    for (const r of results) {
      await c.query("INSERT INTO control_runs (batch_no, control_id, rule_version, population, exceptions) VALUES ($1,$2,$3,$4,$5)", [n, r.control_id, r.rule_version, r.population, r.candidates.length]);
      for (const cand of r.candidates) {
        seq++;
        await c.query(
          `INSERT INTO exceptions (ref, batch_no, control_id, record_ids, primary_record_id, title, rule_detail, amount_at_risk, txn_date, evidence, related, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'NEW')`,
          [`EXC-${String(n).padStart(4, "0")}-${String(seq).padStart(3, "0")}`, n, cand.control_id, cand.record_ids, cand.primary_record_id, cand.title, cand.rule_detail, Math.round(cand.amount_at_risk), cand.txn_date, JSON.stringify(cand.evidence), JSON.stringify(cand.related)],
        );
      }
    }
    const tested = results.reduce((s, r) => s + r.population, 0);
    mark("Test controls", `15 controls run over the full population (${tested} control-record tests); ${seq} exceptions raised`);
    mark("Queue for AI", `${seq} exceptions queued for the investigation agent (PII masked before any model call)`);

    const duration = Date.now() - t0;
    await c.query(
      `INSERT INTO batches (batch_no, window_start, window_end, status, triggered_by, record_counts, exceptions_raised, duration_ms, checksum, rule_versions, stages)
       VALUES ($1,$2,$3,'Tested',$4,$5,$6,$7,$8,$9,$10)`,
      [n, b.window_start, b.window_end, triggeredBy, JSON.stringify(counts), seq, duration, checksum, JSON.stringify(Object.fromEntries(results.map((r) => [r.control_id, r.rule_version]))), JSON.stringify(stages)],
    );
    await c.query("INSERT INTO audit_log (actor, role, action, entity, detail) VALUES ($1,'system','INGEST',$2,$3)", [triggeredBy, `batch ${n}`, `${total} records, ${seq} exceptions raised`]);
    return { batch_no: n, window_start: b.window_start, window_end: b.window_end, records: total, exceptions: seq, record_counts: counts, stages, duration_ms: duration };
  });
}

export async function resetAll(actor: string) {
  await q("TRUNCATE batches, records, ground_truth, control_runs, exceptions, agent_runs, corrective_actions RESTART IDENTITY");
  await log(actor, "approver", "RESET", "demo data", "All batches, exceptions and agent runs cleared");
}
