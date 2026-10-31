import { requireRole, handle, HttpError } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { investigate } from "@/lib/ai/agent";
export const maxDuration = 60;
// Evaluation harness: run the prompt-v1 baseline (single call, no tools) on one exception
// WITHOUT changing the exception, so it can be compared with the agent's stored proposal.
export async function POST(req: Request) {
  return handle(async () => {
    await requireRole("supervisor", "approver");
    const { id } = await req.json();
    const exc = await q1("SELECT * FROM exceptions WHERE id=$1", [Number(id)]);
    if (!exc) throw new HttpError(404, "not found");
    const out = await investigate(exc, { mode: "single" });
    await q(`INSERT INTO agent_runs (exception_id, kind, model, prompt_version, steps, prompt_tokens, completion_tokens, cached_tokens, total_tokens, llm_calls, cost_usd, latency_ms, ok)
      VALUES ($1,'baseline',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
      [exc.id, out.assessment.model, out.assessment.prompt_version, JSON.stringify([{ assessment: out.assessment }]), out.usage.prompt_tokens, out.usage.completion_tokens, out.usage.cached_tokens, out.usage.total_tokens, out.llm_calls, out.cost_usd, out.latency_ms]);
    return { id: exc.id, ref: exc.ref, assessment: out.assessment, usage: out.usage, cost_usd: out.cost_usd, latency_ms: out.latency_ms };
  });
}
