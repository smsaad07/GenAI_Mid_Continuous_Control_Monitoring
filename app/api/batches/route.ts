import { requireRole, handle } from "@/lib/auth";
import { q } from "@/lib/db";
import { SOURCE_SYSTEM } from "@/lib/synth/batch";
export const dynamic = "force-dynamic";
export async function GET() {
  return handle(async () => {
    await requireRole();
    const batches = await q(`SELECT b.*, b.window_start::text AS window_start, b.window_end::text AS window_end,
      (SELECT count(*) FROM exceptions e WHERE e.batch_no=b.batch_no AND e.status IN ('NEW','AI_RUNNING'))::int AS ai_pending,
      (SELECT count(*) FROM exceptions e WHERE e.batch_no=b.batch_no AND e.ai IS NOT NULL)::int AS ai_done
      FROM batches b ORDER BY batch_no DESC LIMIT 60`);
    return { batches, sources: SOURCE_SYSTEM };
  });
}
