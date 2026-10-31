import { requireRole, handle } from "@/lib/auth";
import { resetAll, ingestNextBatch } from "@/lib/ingest";
export const maxDuration = 60;
export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireRole("approver");
    const { batches = 3 } = await req.json().catch(() => ({}));
    await resetAll(s.name);
    for (let i = 0; i < Math.min(10, Number(batches) || 0); i++) await ingestNextBatch(`${s.name} (reset)`);
    return { ok: true };
  });
}
