import { requireRole, handle } from "@/lib/auth";
import { processNext } from "@/lib/ai/agent";
import { q1 } from "@/lib/db";
export const maxDuration = 60;
export async function POST() {
  return handle(async () => {
    const s = await requireRole("supervisor", "approver");
    const r = await processNext(`AI agent (started by ${s.name})`);
    const left = await q1<any>("SELECT count(*)::int AS n FROM exceptions WHERE status IN ('NEW','AI_RUNNING')");
    return { done: !r, result: r, remaining: left?.n ?? 0 };
  });
}
