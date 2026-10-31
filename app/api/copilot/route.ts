import { requireRole, handle } from "@/lib/auth";
import { askCopilot } from "@/lib/ai/copilot";
export const maxDuration = 60;
export async function POST(req: Request) {
  return handle(async () => { await requireRole(); const { messages } = await req.json(); return askCopilot((messages || []).filter((m: any) => m.role === "user" || m.role === "assistant").map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))); });
}
