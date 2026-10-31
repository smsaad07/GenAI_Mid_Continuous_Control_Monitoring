import { NextResponse } from "next/server";
import { ingestNextBatch, ensureSeeded } from "@/lib/ingest";
import { processNext } from "@/lib/ai/agent";
export const maxDuration = 60;
// Scheduled continuous monitoring run (Vercel Cron): ingest the next extract and let the agent work the queue.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  await ensureSeeded();
  const ing = await ingestNextBatch("scheduled run (cron)");
  const t0 = Date.now();
  let processed = 0;
  try { while (Date.now() - t0 < 40_000) { const r = await processNext("AI agent (scheduled)"); if (!r || r.busy) break; processed++; } } catch (e: any) { return NextResponse.json({ ingest: ing, processed, stopped: String(e.message) }); }
  return NextResponse.json({ ingest: ing, processed });
}
