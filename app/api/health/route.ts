import { q1 } from "@/lib/db";
import { hasKey, DEFAULT_MODEL } from "@/lib/ai/groq";
import { handle } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() { return handle(async () => { const r = await q1("SELECT now() AS now"); return { ok: true, db: !!r, ai_configured: hasKey(), model: DEFAULT_MODEL }; }); }
