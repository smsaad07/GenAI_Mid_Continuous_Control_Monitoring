import { Pool, PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __ccmPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __ccmSchema: Promise<void> | undefined;
}

function pool(): Pool {
  if (!global.__ccmPool) {
    const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!cs) throw new Error("DATABASE_URL is not set. Attach a Postgres database (Vercel -> Storage -> Neon).");
    const local = /localhost|127\.0\.0\.1/.test(cs);
    global.__ccmPool = new Pool({ connectionString: cs, max: 4, ssl: local ? undefined : { rejectUnauthorized: false }, idleTimeoutMillis: 10_000 });
  }
  return global.__ccmPool;
}

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  await ensureSchema();
  const r = await pool().query(sql, params);
  return r.rows as T[];
}
export async function q1<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, title TEXT, role TEXT NOT NULL,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS master_data (type TEXT, id TEXT, data JSONB, PRIMARY KEY (type, id));
CREATE TABLE IF NOT EXISTS batches (
  batch_no INT PRIMARY KEY, window_start DATE, window_end DATE, status TEXT, triggered_by TEXT,
  ingested_at TIMESTAMPTZ DEFAULT now(), record_counts JSONB, exceptions_raised INT, duration_ms INT,
  checksum TEXT, rule_versions JSONB, stages JSONB);
CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, batch_no INT, type TEXT, data JSONB);
CREATE INDEX IF NOT EXISTS records_batch_type ON records (batch_no, type);
CREATE TABLE IF NOT EXISTS ground_truth (
  id SERIAL PRIMARY KEY, batch_no INT, control_id TEXT, kind TEXT, record_ids TEXT[], expected_severity TEXT,
  amount_at_risk NUMERIC, scenario TEXT);
CREATE TABLE IF NOT EXISTS control_runs (
  id SERIAL PRIMARY KEY, batch_no INT, control_id TEXT, rule_version TEXT, population INT, exceptions INT, ran_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS exceptions (
  id SERIAL PRIMARY KEY, ref TEXT UNIQUE, batch_no INT, control_id TEXT, record_ids TEXT[], primary_record_id TEXT,
  title TEXT, rule_detail TEXT, amount_at_risk NUMERIC, txn_date DATE, evidence JSONB, related JSONB,
  status TEXT NOT NULL DEFAULT 'NEW', ai JSONB, ai_model TEXT, ai_at TIMESTAMPTZ, ai_attempts INT DEFAULT 0, claimed_at TIMESTAMPTZ,
  sup_decision TEXT, sup_severity TEXT, sup_note TEXT, sup_by TEXT, sup_at TIMESTAMPTZ,
  appr_decision TEXT, appr_note TEXT, appr_by TEXT, appr_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS exceptions_status ON exceptions (status);
CREATE TABLE IF NOT EXISTS agent_runs (
  id SERIAL PRIMARY KEY, exception_id INT, kind TEXT, model TEXT, prompt_version TEXT, steps JSONB,
  prompt_tokens INT DEFAULT 0, completion_tokens INT DEFAULT 0, cached_tokens INT DEFAULT 0, total_tokens INT DEFAULT 0,
  llm_calls INT DEFAULT 0, cost_usd NUMERIC DEFAULT 0, latency_ms INT, ok BOOLEAN, error TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS corrective_actions (
  id SERIAL PRIMARY KEY, ref TEXT UNIQUE, exception_id INT, control_id TEXT, owner TEXT, action TEXT, due_date DATE,
  status TEXT DEFAULT 'OPEN', management_response TEXT, remediation_evidence TEXT, verification_note TEXT,
  updated_by TEXT, closed_by TEXT, closed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT now(), actor TEXT, role TEXT, action TEXT, entity TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB);
`;

export function ensureSchema(): Promise<void> {
  if (!global.__ccmSchema) {
    global.__ccmSchema = (async () => {
      const c = await pool().connect();
      try {
        await c.query("SELECT pg_advisory_lock(727201)");
        await c.query(SCHEMA);
      } finally {
        await c.query("SELECT pg_advisory_unlock(727201)").catch(() => {});
        c.release();
      }
    })().catch((e) => {
      global.__ccmSchema = undefined;
      throw e;
    });
  }
  return global.__ccmSchema;
}

export async function log(actor: string, role: string, action: string, entity: string, detail = "") {
  await q("INSERT INTO audit_log (actor, role, action, entity, detail) VALUES ($1,$2,$3,$4,$5)", [actor, role, action, entity, detail]);
}

export async function getSetting<T>(key: string, dflt: T): Promise<T> {
  const r = await q1<{ value: T }>("SELECT value FROM settings WHERE key=$1", [key]);
  return r ? r.value : dflt;
}
export async function setSetting(key: string, value: any) {
  await q("INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [key, JSON.stringify(value)]);
}
