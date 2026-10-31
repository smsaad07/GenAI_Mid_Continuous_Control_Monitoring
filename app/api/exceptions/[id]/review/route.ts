import { requireRole, handle } from "@/lib/auth";
import { supervisorReview } from "@/lib/workflow";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => { const s = await requireRole("supervisor"); const { id } = await ctx.params; return supervisorReview(Number(id), s, await req.json()); });
}
