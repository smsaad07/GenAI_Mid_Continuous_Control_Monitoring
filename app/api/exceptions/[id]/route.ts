import { requireRole, handle, HttpError } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { CONTROL_BY_ID } from "@/lib/controls/catalog";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/ai/agent";
import { mask } from "@/lib/ai/mask";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRole();
    const { id } = await ctx.params;
    const e = await q1<any>("SELECT *, txn_date::text AS txn_date, amount_at_risk::float AS amount_at_risk FROM exceptions WHERE id=$1 OR ref=$2", [Number(id) || 0, id]);
    if (!e) throw new HttpError(404, "Not found");
    const runs = await q("SELECT id, model, prompt_version, steps, prompt_tokens, completion_tokens, cached_tokens, total_tokens, llm_calls, cost_usd::float AS cost_usd, latency_ms, ok, error, created_at FROM agent_runs WHERE exception_id=$1 ORDER BY id DESC", [e.id]);
    const log = await q("SELECT * FROM audit_log WHERE entity=$1 ORDER BY id", [e.ref]);
    const action = await q1("SELECT *, due_date::text AS due_date FROM corrective_actions WHERE exception_id=$1", [e.id]);
    const prompt = { system: SYSTEM_PROMPT, user: buildUserPrompt(e, mask(e.evidence)) };
    return { exception: e, control: CONTROL_BY_ID[e.control_id], runs, log, action, prompt };
  });
}
