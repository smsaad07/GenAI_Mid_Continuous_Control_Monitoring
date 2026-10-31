import { requireRole, handle } from "@/lib/auth";
import { approverDecision } from "@/lib/workflow";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => { const s = await requireRole("approver"); const { id } = await ctx.params; return approverDecision(Number(id), s, await req.json()); });
}
