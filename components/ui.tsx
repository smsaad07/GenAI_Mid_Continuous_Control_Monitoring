"use client";
import React from "react";
export const STATUS_LABEL: Record<string, string> = {
  NEW: "Queued for AI", AI_RUNNING: "AI investigating", PENDING_REVIEW: "Awaiting supervisor", PENDING_APPROVAL: "Awaiting approver", FINDING: "Finding issued", CLOSED_NO_ISSUE: "Closed - no issue",
  OPEN: "Open", RESPONSE_RECORDED: "Response recorded", PENDING_VERIFICATION: "Awaiting verification", CLOSED: "Closed",
};
export const DISP_LABEL: Record<string, string> = { breach: "Breach", false_positive: "Likely false positive", needs_more_info: "Needs more info" };
export function Sev({ s }: { s?: string | null }) {
  if (!s) return <span className="muted">-</span>;
  return <span className={`pill sev-${s}`}><span className="dot" />{s}</span>;
}
export function Disp({ d, conf }: { d?: string | null; conf?: number | null }) {
  if (!d) return <span className="muted">-</span>;
  return <span className={`pill ${d}`}>{d === "breach" ? "●" : d === "false_positive" ? "✓" : "?"} {DISP_LABEL[d] || d}{conf != null ? ` · ${Math.round(conf * 100)}%` : ""}</span>;
}
export function Status({ s }: { s: string }) {
  const icon = s === "AI_RUNNING" ? <span className="spin" /> : null;
  return <span className="pill st">{icon}{STATUS_LABEL[s] || s}</span>;
}
export function Rating({ r }: { r: string }) {
  const cls = r.startsWith("Ineffective") ? "Ineffective" : r.startsWith("Needs") ? "Needs" : "Effective";
  const icon = cls === "Ineffective" ? "✕" : cls === "Needs" ? "!" : "✓";
  return <span className={`rating ${cls}`}>{icon} {r}</span>;
}
export function Tile({ v, l, h }: { v: React.ReactNode; l: string; h?: React.ReactNode }) {
  return <div className="card tile"><div className="v">{v}</div><div className="l">{l}</div>{h ? <div className="h">{h}</div> : null}</div>;
}
export function Empty({ children }: { children: React.ReactNode }) { return <div className="muted" style={{ padding: 18, textAlign: "center" }}>{children}</div>; }
