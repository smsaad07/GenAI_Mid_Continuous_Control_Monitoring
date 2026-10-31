import { requireRole, handle } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { hasKey, DEFAULT_MODEL, REASONING_EFFORT } from "@/lib/ai/groq";
import { PROMPT_VERSION } from "@/lib/ai/agent";
export const dynamic = "force-dynamic";
export async function GET() {
  return handle(async () => {
    await requireRole();
    const r = await q1<any>("SELECT count(*) FILTER (WHERE status='NEW')::int AS queued, count(*) FILTER (WHERE status='AI_RUNNING')::int AS running FROM exceptions");
    return { ...r, ai_configured: hasKey(), model: DEFAULT_MODEL, reasoning_effort: REASONING_EFFORT, prompt_version: PROMPT_VERSION };
  });
}
