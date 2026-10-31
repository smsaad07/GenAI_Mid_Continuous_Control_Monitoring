import { requireRole, handle } from "@/lib/auth";
import { q } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return handle(async () => {
    await requireRole();
    const u = new URL(req.url).searchParams;
    const type = u.get("type") || "invoice";
    const batch = Number(u.get("batch")) || null;
    const rows = await q(`SELECT id, batch_no, data FROM records WHERE type=$1 ${batch ? "AND batch_no=$2" : ""} ORDER BY batch_no DESC, id LIMIT 200`, batch ? [type, batch] : [type]);
    const counts = await q("SELECT type, count(*)::int AS n FROM records GROUP BY type ORDER BY type");
    return { rows, counts };
  });
}
