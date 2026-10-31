"use client";
import { useEffect, useState } from "react";
import { useMonitor } from "@/components/Shell";
import { api, dt } from "@/components/client";
export default function Activity() {
  const m = useMonitor();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("/api/activity").then((r) => setRows(r.rows)); }, [m.version]);
  return (
    <div className="stack">
      <div><h1>Audit trail</h1><div className="sub">Every ingestion, AI proposal, human decision and sign-off is logged with who, when and what. Latest 300 events.</div></div>
      <div className="card tablewrap"><table><thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
        <tbody>{rows.map((l) => <tr key={l.id}><td className="small muted">{dt(l.at)}</td><td className="small">{l.actor}</td><td className="small">{l.role}</td><td className="small"><b>{l.action}</b></td><td className="mono small">{l.entity}</td><td className="small">{l.detail}</td></tr>)}</tbody></table></div>
    </div>
  );
}
