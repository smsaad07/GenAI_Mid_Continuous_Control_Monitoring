import { requireRole, handle, HttpError } from "@/lib/auth";
import { q } from "@/lib/db";
export const dynamic = "force-dynamic";
// Raw exports used by the evaluation notebook (ground truth is evaluation-harness data, never shown to the agent).
export async function GET(req: Request) {
  return handle(async () => {
    await requireRole("supervisor", "approver");
    const what = new URL(req.url).searchParams.get("what");
    if (what === "exceptions") return { rows: await q("SELECT id, ref, batch_no, control_id, record_ids, title, rule_detail, amount_at_risk::float AS amount_at_risk, evidence, related, status, ai, sup_decision, sup_severity FROM exceptions ORDER BY id") };
    if (what === "ground_truth") return { rows: await q("SELECT batch_no, control_id, kind, record_ids, expected_severity, amount_at_risk::float AS amount_at_risk, scenario FROM ground_truth ORDER BY id") };
    if (what === "agent_runs") return { rows: await q("SELECT id, exception_id, kind, model, prompt_version, prompt_tokens, completion_tokens, cached_tokens, total_tokens, llm_calls, cost_usd::float AS cost_usd, latency_ms, ok, error, steps FROM agent_runs ORDER BY id") };
    if (what === "control_runs") return { rows: await q("SELECT * FROM control_runs ORDER BY id") };
    throw new HttpError(400, "what = exceptions | ground_truth | agent_runs | control_runs");
  });
}
