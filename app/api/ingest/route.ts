import { requireRole, handle } from "@/lib/auth";
import { ingestNextBatch } from "@/lib/ingest";
export const maxDuration = 60;
export async function POST() { return handle(async () => { const s = await requireRole("supervisor", "approver"); return ingestNextBatch(s.name); }); }
