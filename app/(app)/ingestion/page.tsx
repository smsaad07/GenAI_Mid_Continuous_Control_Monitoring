"use client";
import { useEffect, useState } from "react";
import { useMonitor } from "@/components/Shell";
import { api, dt } from "@/components/client";

const TYPES = ["purchase_order","goods_receipt","invoice","payment","bank_change","sales_order","write_off","freight_bill","payslip","attendance","user_access","journal"];
const MASTER = ["vendor","customer","employee","erp_user","contract","route","material","product"];

export default function Ingestion() {
  const m = useMonitor();
  const [d, setD] = useState<any>(null);
  const [type, setType] = useState("invoice");
  const [batch, setBatch] = useState("");
  const [recs, setRecs] = useState<any>(null);
  const [mtype, setMtype] = useState("");
  useEffect(() => { api("/api/batches").then(setD); }, [m.version]);
  useEffect(() => {
    if (mtype) api(`/api/master?type=${mtype}`).then((r) => setRecs({ rows: r.rows.map((x: any) => ({ id: x.id, data: x.data })), counts: [] }));
    else api(`/api/records/list?type=${type}${batch ? `&batch=${batch}` : ""}`).then(setRecs);
  }, [type, batch, mtype, m.version]);
  const canAct = m.user?.role !== "viewer";
  const cols = recs?.rows?.[0] ? Object.keys(recs.rows[0].data).slice(0, 12) : [];
  return (
    <div className="stack">
      <div className="topbar">
        <div><h1>Data ingestion</h1><div className="sub">Read-only extracts from the source systems. Nothing is ever written back to SAP or any source system.</div></div>
        {canAct ? <div className="row"><button className="btn primary" onClick={m.fetchBatch} disabled={m.ingesting}>{m.ingesting ? <><span className="spin" /> Fetching...</> : "⟳ Fetch new data batch"}</button>
          <label className="row small" style={{ margin: 0 }}><input type="checkbox" checked={m.live} onChange={(e) => m.setLive(e.target.checked)} /> Live monitoring (auto-fetch every {m.liveEvery}s)</label></div> : null}
      </div>
      <div className="banner info small">This build runs on <b>synthetic</b> data: each fetch generates the next weekly extract window from a seeded generator with deliberately planted control breaches and look-alike legitimate cases (decoys). In production this step is a scheduled read-only extract from SAP and the other systems, run inside the Company network. A daily scheduled run (Vercel cron) also ingests and triages automatically.</div>
      <div className="card">
        <h2>Source systems</h2>
        <div className="grid g4">{d ? Object.entries(d.sources).map(([t, s]: any) => <div key={t} className="stage"><b>{s}</b><span className="muted">{t.replace("_", " ")}</span></div>) : null}</div>
      </div>
      <div className="card">
        <h2>Batch history</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Batch</th><th>Extract window</th><th>Ingested</th><th>Triggered by</th><th className="num">Records</th><th className="num">Exceptions</th><th>AI progress</th><th>Checksum</th><th className="num">Duration</th></tr></thead>
          <tbody>{d?.batches.map((b: any) => {
            const total = Object.values(b.record_counts || {}).reduce((s: number, x: any) => s + x, 0) as number;
            return <tr key={b.batch_no}><td><b>{b.batch_no}</b></td><td className="small">{b.window_start} → {b.window_end}</td><td className="small">{dt(b.ingested_at)}</td><td className="small">{b.triggered_by}</td>
              <td className="num">{total.toLocaleString()}</td><td className="num">{b.exceptions_raised}</td>
              <td className="small">{b.ai_pending ? <span className="row"><span className="spin" /> {b.ai_done}/{b.exceptions_raised}</span> : <span className="ok-text">✓ {b.ai_done}/{b.exceptions_raised}</span>}</td>
              <td className="mono small">{b.checksum}</td><td className="num small">{b.duration_ms} ms</td></tr>;
          })}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="row between"><h2>Data browser</h2>
          <div className="row">
            <select value={mtype ? "" : type} onChange={(e) => { setMtype(""); setType(e.target.value); }}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <select value={mtype} onChange={(e) => setMtype(e.target.value)}><option value="">(transactions)</option>{MASTER.map((t) => <option key={t} value={t}>master: {t}</option>)}</select>
            {!mtype ? <input placeholder="Batch #" value={batch} onChange={(e) => setBatch(e.target.value)} style={{ width: 90 }} /> : null}
          </div></div>
        <p className="small muted">Showing up to 200 records (first 12 fields). Synthetic identity, bank and tax numbers are shown here to authorised users; they are masked before any AI call.</p>
        <div className="tablewrap"><table>
          <thead><tr>{!mtype ? <th>Batch</th> : null}{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{recs?.rows?.map((r: any) => <tr key={r.id}>{!mtype ? <td>{r.batch_no}</td> : null}{cols.map((c) => { const v = r.data[c]; return <td key={c} className="small">{v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : typeof v === "number" ? v.toLocaleString() : String(v)}</td>; })}</tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}
