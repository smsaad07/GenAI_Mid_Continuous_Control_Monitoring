import { clearSession, handle } from "@/lib/auth";
export async function POST() { return handle(async () => { await clearSession(); return { ok: true }; }); }
