import bcrypt from "bcryptjs";
import { q1 } from "@/lib/db";
import { createSessionCookie, handle, HttpError } from "@/lib/auth";
import { ensureSeeded } from "@/lib/ingest";
export const maxDuration = 60;
export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeeded();
    const { email, password } = await req.json();
    const u = await q1<any>("SELECT * FROM app_users WHERE lower(email)=lower($1)", [String(email || "").trim()]);
    if (!u || !bcrypt.compareSync(String(password || ""), u.password_hash)) throw new HttpError(401, "Invalid email or password");
    await createSessionCookie({ uid: u.id, email: u.email, name: u.name, title: u.title, role: u.role });
    await q1("INSERT INTO audit_log (actor, role, action, entity, detail) VALUES ($1,$2,'SIGN_IN','session','') RETURNING id", [u.name, u.role]);
    return { ok: true, role: u.role, name: u.name };
  });
}
