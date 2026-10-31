"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "./client";

export interface User { uid: number; email: string; name: string; title: string; role: "supervisor" | "approver" | "viewer" }
interface Monitor {
  user: User | null;
  version: number; bump: () => void;
  status: { queued: number; running: number; ai_configured: boolean; model: string; reasoning_effort: string; prompt_version: string } | null;
  agentAuto: boolean; setAgentAuto: (b: boolean) => void; agentBusy: boolean; agentNote: string; agentLog: any[]; pausedUntil: number;
  live: boolean; setLive: (b: boolean) => void; liveEvery: number;
  ingesting: boolean; lastIngest: any; fetchBatch: () => Promise<void>; ingestError: string;
  counts: { pending_review: number; pending_approval: number; open_actions: number };
}
const Ctx = createContext<Monitor>(null as any);
export const useMonitor = () => useContext(Ctx);

const NAV = [
  { sec: "Monitor" },
  { href: "/", label: "Dashboard" },
  { href: "/ingestion", label: "Data ingestion" },
  { href: "/queue", label: "My queue", badge: "queue" },
  { href: "/exceptions", label: "All exceptions" },
  { href: "/controls", label: "Controls (RCM)" },
  { href: "/actions", label: "Corrective actions", badge: "actions" },
  { sec: "AI" },
  { href: "/copilot", label: "Audit copilot" },
  { href: "/report", label: "Committee report" },
  { href: "/evaluation", label: "Evaluation" },
  { sec: "Governance" },
  { href: "/activity", label: "Audit trail" },
  { href: "/about", label: "How it works" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [status, setStatus] = useState<Monitor["status"]>(null);
  const [agentAuto, setAgentAuto] = useState(true);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentNote, setAgentNote] = useState("");
  const [agentLog, setAgentLog] = useState<any[]>([]);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [live, setLive] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [lastIngest, setLastIngest] = useState<any>(null);
  const [ingestError, setIngestError] = useState("");
  const [counts, setCounts] = useState({ pending_review: 0, pending_approval: 0, open_actions: 0 });
  const [menu, setMenu] = useState(false);
  const busyRef = useRef(false);
  const liveEvery = 90;

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me").then((r) => { if (!r.user) router.replace("/login"); else setUser(r.user); }).catch(() => router.replace("/login"));
  }, [router]);
  useEffect(() => { setMenu(false); }, [path]);

  const refreshStatus = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([api("/api/agent/status"), api("/api/dashboard")]);
      setStatus(s);
      setCounts({ pending_review: d.kpi.pending_review, pending_approval: d.kpi.pending_approval, open_actions: d.kpi.open_actions });
    } catch {}
  }, []);
  useEffect(() => { if (user) refreshStatus(); }, [user, version, refreshStatus]);
  useEffect(() => { if (!user) return; const t = setInterval(refreshStatus, 10000); return () => clearInterval(t); }, [user, refreshStatus]);

  const canAct = user && user.role !== "viewer";

  // Agent worker: works the AI queue one exception per request while anything is queued.
  const runWorker = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAgentBusy(true);
    try {
      for (let i = 0; i < 200; i++) {
        setAgentNote("Investigating next exception...");
        const r = await api("/api/agent/next", { method: "POST" });
        if (r.result) {
          setAgentLog((l) => [{ ...r.result, at: new Date().toISOString() }, ...l].slice(0, 30));
          setAgentNote(`${r.result.ref}: ${r.result.assessment.disposition}${r.result.assessment.severity ? " / " + r.result.assessment.severity : ""} - ${r.remaining} left`);
          bump();
        }
        if (r.done || r.remaining === 0) { setAgentNote("Queue empty - agent idle"); break; }
      }
    } catch (e: any) {
      const wait = e.status === 429 ? Math.min(120, Number(e.retryAfter) || 30) : 20;
      setPausedUntil(Date.now() + wait * 1000);
      setAgentNote(e.status === 429 ? `Model rate limit reached - pausing ${wait}s` : `Agent error: ${e.message} - retrying in ${wait}s`);
    } finally {
      busyRef.current = false;
      setAgentBusy(false);
      bump();
    }
  }, [bump]);

  useEffect(() => {
    if (!canAct || !agentAuto || !status || !status.ai_configured) return;
    if (status.queued > 0 && !busyRef.current) {
      const delay = Math.max(0, pausedUntil - Date.now());
      const t = setTimeout(runWorker, delay + 300);
      return () => clearTimeout(t);
    }
  }, [canAct, agentAuto, status, pausedUntil, runWorker]);

  const fetchBatch = useCallback(async () => {
    setIngesting(true);
    setIngestError("");
    try {
      const r = await api("/api/ingest", { method: "POST" });
      setLastIngest(r);
      bump();
    } catch (e: any) { setIngestError(e.message); }
    finally { setIngesting(false); }
  }, [bump]);

  useEffect(() => {
    if (!live || !canAct) return;
    const t = setInterval(() => { fetchBatch(); }, liveEvery * 1000);
    return () => clearInterval(t);
  }, [live, canAct, fetchBatch]);

  const logout = async () => { await api("/api/auth/logout", { method: "POST" }); router.replace("/login"); };
  if (!user) return <div className="main muted">Loading...</div>;

  const queueBadge = user.role === "supervisor" ? counts.pending_review : user.role === "approver" ? counts.pending_approval : 0;
  return (
    <Ctx.Provider value={{ user, version, bump, status, agentAuto, setAgentAuto, agentBusy, agentNote, agentLog, pausedUntil, live, setLive, liveEvery, ingesting, lastIngest, fetchBatch, ingestError, counts }}>
      <div className="shell">
        <aside className={`side ${menu ? "open" : ""}`}>
          <div className="brand">ControlSight CCM<small>Continuous control monitoring · Internal Audit</small></div>
          <nav className="nav">
            {NAV.map((n, i) => n.sec ? <div key={i} className="sec">{n.sec}</div> : (
              <Link key={n.href} href={n.href!} className={path === n.href || (n.href !== "/" && path.startsWith(n.href!)) ? "active" : ""}>
                <span>{n.label}</span>
                {n.badge === "queue" && queueBadge > 0 ? <span className="count hot">{queueBadge}</span> : null}
                {n.badge === "actions" && counts.open_actions > 0 ? <span className="count">{counts.open_actions}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="card" style={{ marginTop: 18, padding: 12 }}>
            <div className="small muted">Signed in as</div>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div className="small sub">{user.title}</div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={logout}>Sign out</button>
          </div>
          <p className="small muted" style={{ padding: "12px 6px" }}>All data in this demo is synthetic. No real company, employee or customer records are used.</p>
        </aside>
        <main className="main">
          <div className="row between" style={{ marginBottom: 12 }}>
            <button className="btn sm menu-btn" onClick={() => setMenu(!menu)}>☰ Menu</button>
            <AgentBar />
          </div>
          {children}
        </main>
      </div>
    </Ctx.Provider>
  );
}

function AgentBar() {
  const m = useMonitor();
  if (!m.status) return null;
  return (
    <div className="row small" style={{ marginLeft: "auto" }}>
      {m.live ? <span className="row" title="Live monitoring fetches a new extract automatically"><span className="pulse" /> Live monitoring (every {m.liveEvery}s)</span> : null}
      {!m.status.ai_configured ? <span className="pill" style={{ borderColor: "var(--critical)" }}>AI offline - no model key</span> : (
        <span className="row">{m.agentBusy ? <span className="spin" /> : <span className="dot" style={{ background: m.status.queued ? "var(--warning)" : "var(--good)" }} />}
          <span className="sub">Agent: {m.agentNote || (m.status.queued ? `${m.status.queued} queued` : "idle")}</span></span>
      )}
      <span className="muted">· {m.status.model}</span>
    </div>
  );
}
