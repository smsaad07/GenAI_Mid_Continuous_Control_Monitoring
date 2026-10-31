import { requireRole, handle, HttpError } from "@/lib/auth";
import { q1 } from "@/lib/db";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRole();
    const { id } = await ctx.params;
    const r = (await q1("SELECT id, type, batch_no, data FROM records WHERE id=$1", [id])) || (await q1("SELECT id, type, data FROM master_data WHERE id=$1", [id]));
    if (!r) throw new HttpError(404, "Not found");
    return r;
  });
}
