"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMonitor } from "@/components/Shell";
import { api, pkrShort, dt } from "@/components/client";
import { Rating } from "@/components/ui";

export default function Controls() {
  const m = useMonitor();
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => { api("/api/dashboard").then(setD); }, [m.version]);
  if (!d) return <div className="muted">Loading...</div>;
  const sign = async (c: any, rating: string) => { await api(`/api/controls/${c.id}/signoff`, { body: { rating, note } }); setNote(""); m.bump(); };
  return (
    <div className="stack">
      <div><h1>Risk & control matrix</h1><div className="sub">The 15 key controls monitored continuously. Ratings are proposed by the system from the open exceptions; the Head of Internal Audit signs them off.</div></div>
      <div className="banner small">Rating logic (deterministic): any open High-severity breach → <b>Ineffective</b>; any Medium, or more than one Low → <b>Needs improvement</b>; exceptions still with the AI → <b>Effective (provisional)</b>; otherwise <b>Effective</b>. Severity uses the supervisor-confirmed rating where it exists, otherwise the AI proposal.</div>
      {d.controls.map((c: any) => (
        <div key={c.id} className="card">
          <div className="row between">
            <div><span className="mono muted">{c.id}</span> <b>{c.name}</b> <span className="pill">{c.process}</span></div>
            <div className="row"><Rating r={c.rating} />{c.signoff ? <span className="small muted">Signed off: <b>{c.signoff.rating}</b> by {c.signoff.by} {dt(c.signoff.at)}</span> : null}
              <button className="btn sm" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Hide" : "Details"}</button></div>
          </div>
          <div className="row small sub" style={{ marginTop: 6 }}>
            <span>{c.population.toLocaleString()} records tested</span>·<span><Link href={`/exceptions?control=${c.id}`}>{c.exceptions} exceptions</Link></span>·<span>{c.findings} findings</span>·<span>{c.cleared} cleared</span>·<span>{c.pending_ai} with AI</span>·<span>{c.in_review} in review</span>·<span>open at risk {pkrShort(c.amount)}</span>·<span className="muted">rule {c.rule_version}</span>
          </div>
          {open === c.id ? (
            <div style={{ marginTop: 12 }}>
              <div className="kv">
                <div>Risk</div><div>{c.risk}</div><div>Control</div><div>{c.controlStatement}</div><div>Automated test</div><div>{c.ruleDescription}</div><div>Severity rubric</div><div>{c.severityRubric}</div>
                <div>Accepted explanations</div><div>{c.legitimateExplanations}</div><div>Process owner</div><div>{c.owner}</div><div>Source systems</div><div>{c.sourceSystems.join(", ")}</div><div>Frequency</div><div>{c.frequency}</div><div>Regulation / standard</div><div>{c.regulation}</div>
              </div>
              {m.user?.role === "approver" ? (
                <div className="row" style={{ marginTop: 10 }}>
                  <input placeholder="Sign-off note" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
                  {["Effective", "Needs improvement", "Ineffective"].map((r) => <button key={r} className="btn sm" onClick={() => sign(c, r)}>Sign off as {r}</button>)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
