import { requireRole, handle } from "@/lib/auth";
import { processNext } from "@/lib/ai/agent";
import { q1 } from "@/lib/db";
export const maxDuration = 60;
export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireRole("supervisor", "approver");
    const mb = Number(new URL(req.url).searchParams.get("max_batch")) || undefined;
    const r = await processNext(`AI agent (started by ${s.name})`, mb);
    const left = await q1<any>("SELECT count(*)::int AS n FROM exceptions WHERE status IN ('NEW','AI_RUNNING') AND batch_no <= $1", [mb ?? 2147483647]);
    return { done: !r, result: r, remaining: left?.n ?? 0 };
  });
}
