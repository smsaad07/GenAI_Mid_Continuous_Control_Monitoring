"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/client";

const DEMO = [
  { email: "supervisor@ccm.demo", password: "Supervisor@2026", label: "Audit Supervisor", desc: "Reviews every AI proposal; confirms, overrides or dismisses; records management responses; runs data fetches." },
  { email: "approver@ccm.demo", password: "Approver@2026", label: "Head of Internal Audit (Approver)", desc: "Signs off every supervisor decision, verifies and closes corrective actions, signs off control ratings." },
  { email: "committee@ccm.demo", password: "Committee@2026", label: "Audit Committee (read-only)", desc: "Views dashboard, controls and the committee report." },
];

export default function Login() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e?: string, p?: string) => {
    setBusy(true); setErr("");
    try { await api("/api/auth/login", { body: { email: e ?? email, password: p ?? password } }); r.replace("/"); }
    catch (x: any) { setErr(x.message); setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "48px 16px" }}>
      <h1>ControlSight CCM</h1>
      <p className="sub" style={{ maxWidth: 680 }}>Continuous control monitoring for Internal Audit. Every transaction is tested against the risk and control matrix as data arrives; an AI agent investigates each exception and proposes a rating; a supervisor reviews it and the Head of Internal Audit approves it.</p>
      <div className="banner info" style={{ marginTop: 14 }}>Demo build on <b>synthetic data</b> (anonymised biscuit &amp; cake manufacturer with three factories). Pick a role to sign in - no installation or key needed. The first sign-in loads the initial data extracts and can take ~10 seconds.</div>
      <div className="grid g3" style={{ marginTop: 18 }}>
        {DEMO.map((d) => (
          <div key={d.email} className="card stack" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>{d.label}</h3>
            <p className="small sub" style={{ flex: 1 }}>{d.desc}</p>
            <div className="small mono muted">{d.email}<br />{d.password}</div>
            <button className="btn primary" disabled={busy} onClick={() => go(d.email, d.password)}>Sign in as {d.label.split(" (")[0]}</button>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 18, maxWidth: 420 }}>
        <h3>Or sign in manually</h3>
        <form onSubmit={(e) => { e.preventDefault(); go(); }} className="stack" style={{ gap: 8 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        </form>
        {err ? <p className="bad-text small" style={{ marginTop: 8 }}>{err}</p> : null}
      </div>
    </div>
  );
}
