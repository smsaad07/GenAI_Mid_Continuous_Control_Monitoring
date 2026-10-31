// Audit copilot: a read-only, tool-using agent the supervisor/approver can question in plain
// language ("which vendors have the most high-severity exceptions this month?"). It plans which
// queries to run, runs them, and answers with figures that are then faithfulness-checked.
// It has no write tools.
import { q, q1 } from "../db";
import { CONTROLS, CONTROL_BY_ID } from "../controls/catalog";
import { chat, costUsd, addUsage, ZERO, Usage, DEFAULT_MODEL, hasKey } from "./groq";
import { checkFaithfulness } from "./verify";
import { dashboard } from "../stats";

const SYSTEM = `You are the audit copilot of a continuous control monitoring tool for Internal Audit at a Pakistani food manufacturer (synthetic data).
Answer the user's question by calling the read-only tools to get facts; never guess numbers. Plan the minimum calls needed.
Statuses: NEW/AI_RUNNING (queued for AI), PENDING_REVIEW (AI proposed, supervisor to review), PENDING_APPROVAL (supervisor decided, approver to sign), FINDING (approved breach), CLOSED_NO_ISSUE.
Answer concisely for an auditor: short paragraphs or a compact list, cite exception refs (EXC-...) and amounts in PKR exactly as returned by tools. If the data cannot answer the question, say so.
Controls: ${CONTROLS.map((c) => `${c.id} ${c.name}`).join("; ")}.`;

const TOOLS = [
  { type: "function", function: { name: "get_kpis", description: "Overall monitoring KPIs and per-control status/rating.", parameters: { type: "object", properties: {} } } },
  {
    type: "function",
    function: {
      name: "query_exceptions",
      description: "List exceptions filtered by any of: control_id, process, status, ai_disposition (breach|false_positive|needs_more_info), severity, batch_no, min_amount. Sorted by amount desc. Max 25.",
      parameters: { type: "object", properties: { control_id: { type: "string" }, process: { type: "string" }, status: { type: "string" }, ai_disposition: { type: "string" }, severity: { type: "string" }, batch_no: { type: "integer" }, min_amount: { type: "number" }, limit: { type: "integer" } } },
    },
  },
  { type: "function", function: { name: "get_exception", description: "Full detail of one exception by ref (EXC-....-...), including AI assessment and review trail.", parameters: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] } } },
  {
    type: "function",
    function: {
      name: "exposure_by",
      description: "Aggregate open breach exposure (count and PKR amount at risk, AI-proposed or confirmed breaches) grouped by vendor, control, process, plant or batch.",
      parameters: { type: "object", properties: { group_by: { type: "string", enum: ["vendor", "control", "process", "plant", "batch"] } }, required: ["group_by"] },
    },
  },
  { type: "function", function: { name: "corrective_actions", description: "List corrective actions with status, owner and due date.", parameters: { type: "object", properties: { status: { type: "string" } } } } },
];

async function tool(name: string, a: any) {
  if (name === "get_kpis") {
    const d = await dashboard();
    return { kpi: d.kpi, controls: d.controls.map((c) => ({ id: c.id, name: c.name, process: c.process, population_tested: c.population, exceptions: c.exceptions, findings: c.findings, high: c.high, medium: c.medium, low: c.low, rating: c.rating, amount_at_risk: c.amount })) };
  }
  if (name === "query_exceptions") {
    const w: string[] = [], p: any[] = [];
    const add = (sql: string, v: any) => { p.push(v); w.push(sql.replace("?", `$${p.length}`)); };
    if (a.control_id) add("control_id = ?", a.control_id);
    if (a.process) add("control_id = ANY(?)", CONTROLS.filter((c) => c.process.toLowerCase().includes(String(a.process).toLowerCase())).map((c) => c.id));
    if (a.status) add("status = ?", a.status);
    if (a.ai_disposition) add("ai->>'disposition' = ?", a.ai_disposition);
    if (a.severity) add("COALESCE(sup_severity, ai->>'severity') = ?", a.severity);
    if (a.batch_no) add("batch_no = ?", a.batch_no);
    if (a.min_amount) add("amount_at_risk >= ?", a.min_amount);
    const rows = await q(`SELECT ref, batch_no, control_id, title, status, amount_at_risk::float AS amount_at_risk, ai->>'disposition' AS ai_disposition, ai->>'severity' AS ai_severity, sup_severity FROM exceptions ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY amount_at_risk DESC NULLS LAST LIMIT ${Math.min(25, Number(a.limit) || 15)}`, p);
    const total = await q1(`SELECT count(*)::int AS n, COALESCE(sum(amount_at_risk),0)::float AS amount FROM exceptions ${w.length ? "WHERE " + w.join(" AND ") : ""}`, p);
    return { total_matching: total?.n, total_amount: total?.amount, rows };
  }
  if (name === "get_exception") {
    const e = await q1("SELECT ref, batch_no, control_id, title, rule_detail, status, amount_at_risk::float AS amount_at_risk, ai, sup_decision, sup_severity, sup_note, sup_by, appr_decision, appr_note, appr_by FROM exceptions WHERE ref=$1", [a.ref]);
    return e || { error: "not found" };
  }
  if (name === "exposure_by") {
    const g = a.group_by;
    const expr = g === "vendor" ? "COALESCE(evidence->'invoice'->0->>'vendor_name', evidence->'purchase_order'->0->>'vendor_name', evidence->'payment'->0->>'vendor_name', evidence->'freight_bill'->0->>'transporter_name', evidence->'sales_order'->0->>'customer_name', 'n/a (non-vendor control)')"
      : g === "plant" ? "COALESCE(evidence->'purchase_order'->0->>'plant', evidence->'write_off'->0->>'plant', evidence->'payslip'->0->>'plant', evidence->'attendance'->0->>'plant', 'n/a')"
      : g === "batch" ? "batch_no::text" : "control_id";
    const rows = await q(`SELECT ${expr} AS grp, count(*)::int AS breaches, COALESCE(sum(amount_at_risk),0)::float AS amount_at_risk FROM exceptions
      WHERE (status='FINDING' OR (status IN ('PENDING_REVIEW','PENDING_APPROVAL') AND ai->>'disposition'='breach')) GROUP BY 1 ORDER BY 3 DESC LIMIT 15`);
    if (g === "process") {
      const agg: Record<string, any> = {};
      for (const r of rows as any[]) { const pr = CONTROL_BY_ID[r.grp]?.process || r.grp; agg[pr] ||= { grp: pr, breaches: 0, amount_at_risk: 0 }; agg[pr].breaches += r.breaches; agg[pr].amount_at_risk += r.amount_at_risk; }
      return Object.values(agg);
    }
    return rows;
  }
  if (name === "corrective_actions") {
    return q(`SELECT ref, control_id, owner, action, status, due_date::text, management_response FROM corrective_actions ${a.status ? "WHERE status=$1" : ""} ORDER BY id DESC LIMIT 25`, a.status ? [a.status] : []);
  }
  return { error: "unknown tool" };
}

export async function askCopilot(history: { role: "user" | "assistant"; content: string }[]) {
  if (!hasKey()) return { answer: "The AI copilot needs a GROQ_API_KEY to be configured on the server.", steps: [], usage: ZERO, cost_usd: 0, faithfulness: null };
  const messages: any[] = [{ role: "system", content: SYSTEM }, ...history.slice(-8)];
  const steps: any[] = [];
  const corpus: string[] = [];
  let usage: Usage = ZERO;
  let calls = 0;
  const t0 = Date.now();
  let answer = "";
  for (let i = 0; i < 6; i++) {
    const r = await chat({ messages, tools: TOOLS, tool_choice: i === 5 ? "none" : "auto", reasoning_effort: "low" });
    calls++;
    usage = addUsage(usage, r.usage);
    const tcs = r.message.tool_calls || [];
    if (!tcs.length) { answer = r.message.content || ""; break; }
    messages.push({ role: "assistant", content: r.message.content || "", tool_calls: tcs });
    for (const tc of tcs) {
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      const res = await tool(tc.function.name, args);
      const text = JSON.stringify(res);
      corpus.push(text);
      steps.push({ tool: tc.function.name, arguments: args, result_preview: text.slice(0, 400) });
      messages.push({ role: "tool", tool_call_id: tc.id, content: text.slice(0, 12000) });
    }
  }
  const faith = checkFaithfulness(answer, corpus.join("\n") + JSON.stringify(history));
  const cost = costUsd(DEFAULT_MODEL, usage);
  await q("INSERT INTO agent_runs (kind, model, prompt_version, steps, prompt_tokens, completion_tokens, cached_tokens, total_tokens, llm_calls, cost_usd, latency_ms, ok) VALUES ('copilot',$1,'copilot-v1',$2,$3,$4,$5,$6,$7,$8,$9,true)",
    [DEFAULT_MODEL, JSON.stringify(steps), usage.prompt_tokens, usage.completion_tokens, usage.cached_tokens, usage.total_tokens, calls, cost, Date.now() - t0]);
  return { answer, steps, usage, cost_usd: cost, faithfulness: faith };
}

export async function generateReport() {
  const d = await dashboard();
  const facts = {
    kpi: d.kpi,
    controls: d.controls.map((c) => ({ id: c.id, name: c.name, process: c.process, population_tested: c.population, exceptions: c.exceptions, findings: c.findings, open_high: c.high, open_medium: c.medium, open_low: c.low, rating: c.rating, amount_at_risk: Math.round(c.amount) })),
  };
  if (!hasKey()) return { text: "Report generation needs GROQ_API_KEY.", facts, faithfulness: null, usage: ZERO, cost_usd: 0 };
  const r = await chat({
    reasoning_effort: "low",
    messages: [
      { role: "system", content: "You write the continuous-monitoring summary for the Board Audit Committee of a food manufacturer (synthetic demo data). Use ONLY the figures in the JSON provided; do not compute new totals unless trivially additive. Structure: 1) Overall assurance position (2-3 sentences), 2) Controls rated Ineffective or Needs improvement with why, 3) Exposure and themes, 4) Pipeline status (what is awaiting AI, supervisor, approver), 5) Matters for the Committee's attention. Plain text with short headings, under 350 words. State that ratings are proposed until signed off by the Head of Internal Audit." },
      { role: "user", content: JSON.stringify(facts) },
    ],
  });
  const text = r.message.content || "";
  const faithfulness = checkFaithfulness(text, JSON.stringify(facts));
  const cost = costUsd(DEFAULT_MODEL, r.usage);
  await q("INSERT INTO agent_runs (kind, model, prompt_version, steps, prompt_tokens, completion_tokens, cached_tokens, total_tokens, llm_calls, cost_usd, latency_ms, ok) VALUES ('report',$1,'report-v1','[]',$2,$3,$4,$5,1,$6,$7,true)",
    [DEFAULT_MODEL, r.usage.prompt_tokens, r.usage.completion_tokens, r.usage.cached_tokens, r.usage.total_tokens, cost, r.latency_ms]);
  return { text, facts, faithfulness, usage: r.usage, cost_usd: cost, generated_at: new Date().toISOString() };
}
