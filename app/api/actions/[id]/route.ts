import { requireRole, handle } from "@/lib/auth";
import { updateAction } from "@/lib/workflow";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => { const s = await requireRole("supervisor", "approver"); const { id } = await ctx.params; return updateAction(Number(id), s, await req.json()); });
}
