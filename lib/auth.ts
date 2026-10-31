import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type Role = "supervisor" | "approver" | "viewer";
export interface Session { uid: number; email: string; name: string; title: string; role: Role }

const COOKIE = "ccm_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET || "ccm-demo-fallback-secret-change-me-please");

export async function createSessionCookie(s: Session) {
  const token = await new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.VERCEL === "1", path: "/", maxAge: 60 * 60 * 12 });
}
export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
export async function getSession(): Promise<Session | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export class HttpError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }

export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not signed in");
  if (roles.length && !roles.includes(s.role)) throw new HttpError(403, `This action needs role: ${roles.join(" or ")}`);
  return s;
}

export function handle(fn: () => Promise<any>) {
  return fn().then(
    (data) => NextResponse.json(data),
    (e: any) => {
      const status = e instanceof HttpError ? e.status : e?.retryAfter ? 429 : 500;
      if (status === 500) console.error(e);
      return NextResponse.json({ error: String(e?.message || e), retryAfter: e?.retryAfter }, { status });
    },
  );
}
