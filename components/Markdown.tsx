"use client";
import React from "react";

// Minimal, safe markdown renderer for model output (headings, bold, lists, tables, paragraphs). No HTML injection.
function inline(text: string, key: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => p.startsWith("**") && p.endsWith("**") ? <b key={key + i}>{p.slice(2, -2)}</b> : p.startsWith("`") && p.endsWith("`") ? <code key={key + i}>{p.slice(1, -1)}</code> : <React.Fragment key={key + i}>{p}</React.Fragment>);
}
export default function Markdown({ text }: { text: string }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(<div key={i} className="tablewrap" style={{ margin: "6px 0 10px" }}><table><thead><tr>{head.map((c, k) => <th key={k}>{inline(c, `h${k}`)}</th>)}</tr></thead><tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c, `c${k}${j}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\./.test(l);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "")); i++; }
      const Tag = ordered ? "ol" : "ul";
      out.push(<Tag key={i} style={{ margin: "4px 0 10px", paddingLeft: 20 }}>{items.map((it, k) => <li key={k}>{inline(it, `l${k}`)}</li>)}</Tag>);
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push(<div key={i} style={{ fontWeight: 700, fontSize: h[1].length <= 2 ? 16 : 14, margin: "10px 0 4px" }}>{inline(h[2], `t${i}`)}</div>); i++; continue; }
    if (/^\*\*[^*]+\*\*\s*$/.test(l.trim())) { out.push(<div key={i} style={{ fontWeight: 700, margin: "10px 0 4px" }}>{l.trim().slice(2, -2)}</div>); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*]\s|\d+\.\s|#)/.test(lines[i])) { para.push(lines[i]); i++; }
    if (!para.length) { para.push(lines[i]); i++; }
    out.push(<p key={i} style={{ margin: "0 0 8px" }}>{inline(para.join(" "), `p${i}`)}</p>);
  }
  return <div>{out}</div>;
}
