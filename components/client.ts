"use client";
export async function api<T = any>(url: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const res = await fetch(url, { method: opts.method || (opts.body ? "POST" : "GET"), headers: opts.body ? { "Content-Type": "application/json" } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.includes("/auth/")) window.location.href = "/login";
  if (!res.ok) { const e: any = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; e.retryAfter = data.retryAfter; throw e; }
  return data as T;
}
export const pkr = (n: number | null | undefined) => (n == null ? "-" : "PKR " + Math.round(Number(n)).toLocaleString("en-US"));
export const pkrShort = (n: number) => { const v = Number(n) || 0; if (v >= 1e9) return `PKR ${(v / 1e9).toFixed(2)}bn`; if (v >= 1e6) return `PKR ${(v / 1e6).toFixed(2)}m`; if (v >= 1e3) return `PKR ${(v / 1e3).toFixed(0)}k`; return `PKR ${Math.round(v)}`; };
export const pct = (x: number | null | undefined, d = 1) => (x == null ? "n/a" : `${(x * 100).toFixed(d)}%`);
export const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");
export const usd = (n: number) => `$${Number(n || 0).toFixed(n < 0.01 ? 5 : 4)}`;
