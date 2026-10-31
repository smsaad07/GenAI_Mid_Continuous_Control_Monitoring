"use client";
import { useEffect, useState } from "react";
import { useMonitor } from "@/components/Shell";
import { api } from "@/components/client";
import ExceptionTable from "@/components/ExceptionTable";
import { STATUS_LABEL } from "@/components/ui";

const CONTROLS = ["P2P-01","P2P-02","P2P-03","P2P-04","P2P-05","O2C-01","O2C-02","INV-01","LOG-01","PAY-01","PAY-02","PAY-03","ITA-01","ITA-02","GL-01"];
export default function Exceptions() {
  const m = useMonitor();
  const [f, setF] = useState<any>({ status: "", control: "", disposition: "", q: "", batch: "" });
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { const p = new URLSearchParams(window.location.search); setF((x: any) => ({ ...x, control: p.get("control") || "", status: p.get("status") || "" })); }, []);
  useEffect(() => {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any);
    api(`/api/exceptions?${p}`).then((r) => setRows(r.rows));
  }, [f, m.version]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="stack">
      <div><h1>All exceptions</h1><div className="sub">Every exception raised by the rules, with the AI proposal and the review trail.</div></div>
      <div className="card row">
        <select value={f.status} onChange={set("status")}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).slice(0, 6).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={f.control} onChange={set("control")}><option value="">All controls</option>{CONTROLS.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={f.disposition} onChange={set("disposition")}><option value="">Any AI disposition</option><option value="breach">Breach</option><option value="false_positive">Likely false positive</option><option value="needs_more_info">Needs more info</option></select>
        <input placeholder="Batch #" value={f.batch} onChange={set("batch")} style={{ width: 90 }} />
        <input placeholder="Search ref or title" value={f.q} onChange={set("q")} />
        <span className="muted small">{rows ? `${rows.length} shown` : ""}</span>
      </div>
      <div className="card">{rows ? <ExceptionTable rows={rows} showReview /> : <span className="muted">Loading...</span>}</div>
    </div>
  );
}
