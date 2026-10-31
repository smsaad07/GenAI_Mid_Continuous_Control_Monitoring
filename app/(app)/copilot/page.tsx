"use client";
import { useState } from "react";
import { api, usd } from "@/components/client";
import Markdown from "@/components/Markdown";

const SUGGEST = [
  "Which controls are currently rated Ineffective and why?",
  "Top 5 open breaches by amount at risk",
  "Which vendors carry the most breach exposure?",
  "How many exceptions are waiting for the supervisor and for the approver?",
  "Summarise the payroll and labour-law exceptions in the latest batch",
];
export default function Copilot() {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async (text: string) => {
    if (!text.trim()) return;
    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await api("/api/copilot", { body: { messages: next.map((m) => ({ role: m.role, content: m.content })) } });
      setMsgs([...next, { role: "assistant", content: r.answer, steps: r.steps, usage: r.usage, cost: r.cost_usd, faith: r.faithfulness }]);
    } catch (e: any) { setMsgs([...next, { role: "assistant", content: `Error: ${e.message}` }]); }
    finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div><h1>Audit copilot</h1><div className="sub">Ask questions about the monitoring results in plain language. The copilot is an agent with read-only query tools: it decides which queries to run, runs them and answers from the results. It cannot change anything.</div></div>
      <div className="row">{SUGGEST.map((s) => <button key={s} className="btn sm" onClick={() => ask(s)} disabled={busy}>{s}</button>)}</div>
      <div className="card chat">
        {msgs.length === 0 ? <p className="muted">Ask a question to start.</p> : null}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`} style={{ whiteSpace: m.role === "user" ? "pre-wrap" : "normal" }}>
            {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
            {m.steps?.length ? <details className="small" style={{ marginTop: 8 }}><summary className="muted">{m.steps.length} tool calls · {m.usage?.total_tokens} tokens · {usd(m.cost)}{m.faith ? (m.faith.ok ? ` · ✓ ${m.faith.checked} figures verified` : ` · ⚠ unverified: ${m.faith.unverified.join(", ")}`) : ""}</summary>
              {m.steps.map((s: any, j: number) => <div key={j} className="mono" style={{ marginTop: 4 }}>→ {s.tool}({JSON.stringify(s.arguments)})</div>)}</details> : null}
          </div>
        ))}
        {busy ? <div className="row muted small"><span className="spin" /> The copilot is querying the monitoring data...</div> : null}
        <form className="row" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <input style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Which plant has the most payroll exceptions?" />
          <button className="btn primary" disabled={busy}>Ask</button>
        </form>
      </div>
    </div>
  );
}
