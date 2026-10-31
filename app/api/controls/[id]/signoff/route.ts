import { requireRole, handle, HttpError } from "@/lib/auth";
import { setSetting, log } from "@/lib/db";
import { CONTROL_BY_ID } from "@/lib/controls/catalog";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await requireRole("approver");
    const { id } = await ctx.params;
    if (!CONTROL_BY_ID[id]) throw new HttpError(404, "Unknown control");
    const { rating, note } = await req.json();
    await setSetting(`signoff:${id}`, { rating, note, by: s.name, at: new Date().toISOString() });
    await log(s.name, s.role, "CONTROL_RATING_SIGNED_OFF", id, `${rating}${note ? " - " + note : ""}`);
    return { ok: true };
  });
}
