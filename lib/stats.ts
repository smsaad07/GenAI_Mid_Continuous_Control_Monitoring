import { q, q1 } from "./db";
import { CONTROLS } from "./controls/catalog";

// Proposed control rating (deterministic): uses supervisor-confirmed severity when available,
// otherwise the AI-proposed severity of open breaches. Approver signs it off on the Controls page.
export function rateControl(open: { High: number; Medium: number; Low: number }, pendingAi: number) {
  if (open.High > 0) return "Ineffective";
  if (open.Medium > 0 || open.Low > 1) return "Needs improvement";
  if (pendingAi > 0) return "Effective (provisional)";
  return "Effective";
}

export async function dashboard() {
  const kpi = await q1<any>(`SELECT
    (SELECT count(*) FROM batches)::int AS batches,
    (SELECT COALESCE(sum(c.population),0) FROM control_runs c)::int AS tests,
    (SELECT count(*) FROM records)::int AS records,
    (SELECT count(*) FROM exceptions)::int AS exceptions,
    (SELECT count(*) FROM exceptions WHERE status IN ('NEW','AI_RUNNING'))::int AS ai_queue,
    (SELECT count(*) FROM exceptions WHERE status='PENDING_REVIEW')::int AS pending_review,
    (SELECT count(*) FROM exceptions WHERE status='PENDING_APPROVAL')::int AS pending_approval,
    (SELECT count(*) FROM exceptions WHERE status='FINDING')::int AS findings,
    (SELECT count(*) FROM exceptions WHERE status='CLOSED_NO_ISSUE')::int AS closed_no_issue,
    (SELECT count(*) FROM corrective_actions WHERE status<>'CLOSED')::int AS open_actions,
    (SELECT count(*) FROM corrective_actions WHERE status<>'CLOSED' AND due_date < now()::date)::int AS overdue_actions,
    (SELECT COALESCE(sum(amount_at_risk),0) FROM exceptions WHERE (status='FINDING') OR (status IN ('PENDING_REVIEW','PENDING_APPROVAL') AND ai->>'disposition'='breach'))::float AS amount_at_risk,
    (SELECT max(ingested_at) FROM batches) AS last_ingest,
    (SELECT COALESCE(sum(cost_usd),0) FROM agent_runs)::float AS ai_cost_usd,
    (SELECT COALESCE(sum(total_tokens),0) FROM agent_runs)::int AS ai_tokens`);
  const rows = await q<any>(`SELECT control_id,
      count(*)::int AS exceptions,
      count(*) FILTER (WHERE status IN ('NEW','AI_RUNNING'))::int AS pending_ai,
      count(*) FILTER (WHERE status IN ('PENDING_REVIEW','PENDING_APPROVAL'))::int AS in_review,
      count(*) FILTER (WHERE status='FINDING')::int AS findings,
      count(*) FILTER (WHERE status='CLOSED_NO_ISSUE')::int AS cleared,
      count(*) FILTER (WHERE COALESCE(sup_severity, CASE WHEN ai->>'disposition'='breach' THEN ai->>'severity' END)='High' AND status IN ('PENDING_REVIEW','PENDING_APPROVAL','FINDING') AND COALESCE(sup_decision,'')<>'dismissed')::int AS high,
      count(*) FILTER (WHERE COALESCE(sup_severity, CASE WHEN ai->>'disposition'='breach' THEN ai->>'severity' END)='Medium' AND status IN ('PENDING_REVIEW','PENDING_APPROVAL','FINDING') AND COALESCE(sup_decision,'')<>'dismissed')::int AS medium,
      count(*) FILTER (WHERE COALESCE(sup_severity, CASE WHEN ai->>'disposition'='breach' THEN ai->>'severity' END)='Low' AND status IN ('PENDING_REVIEW','PENDING_APPROVAL','FINDING') AND COALESCE(sup_decision,'')<>'dismissed')::int AS low,
      COALESCE(sum(amount_at_risk) FILTER (WHERE status='FINDING' OR (status IN ('PENDING_REVIEW','PENDING_APPROVAL') AND ai->>'disposition'='breach')),0)::float AS amount
    FROM exceptions GROUP BY control_id`);
  const pop = await q<any>("SELECT control_id, sum(population)::int AS population, max(rule_version) AS rule_version FROM control_runs GROUP BY control_id");
  const signoffs = await q<any>("SELECT key, value FROM settings WHERE key LIKE 'signoff:%'");
  const so = Object.fromEntries(signoffs.map((s) => [s.key.slice(8), s.value]));
  const controls = CONTROLS.map((c) => {
    const r = rows.find((x) => x.control_id === c.id) || { exceptions: 0, pending_ai: 0, in_review: 0, findings: 0, cleared: 0, high: 0, medium: 0, low: 0, amount: 0 };
    const p = pop.find((x) => x.control_id === c.id);
    return { ...c, ...r, population: p?.population || 0, rule_version: p?.rule_version, rating: rateControl({ High: r.high, Medium: r.medium, Low: r.low }, r.pending_ai), signoff: so[c.id] || null };
  });
  const byBatch = await q<any>(`SELECT b.batch_no, b.window_start, b.window_end, b.ingested_at, b.exceptions_raised,
      (SELECT count(*) FROM records r WHERE r.batch_no=b.batch_no)::int AS records,
      (SELECT count(*) FROM exceptions e WHERE e.batch_no=b.batch_no AND e.ai->>'disposition'='breach')::int AS ai_breaches,
      (SELECT count(*) FROM exceptions e WHERE e.batch_no=b.batch_no AND e.ai->>'disposition'='false_positive')::int AS ai_cleared
    FROM batches b ORDER BY b.batch_no`);
  return { kpi, controls, byBatch };
}
