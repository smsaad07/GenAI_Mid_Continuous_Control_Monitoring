// Investigation agent. For each exception raised by a rule, the agent:
//   1. receives the exception, the control's policy + severity rubric and the masked evidence;
//   2. decides which related records to look up (read-only tools) - this is the agentic part;
//   3. submits a structured assessment (disposition, severity, confidence, explanation, action);
//   4. a deterministic verifier then checks every cited ID/date/amount against what it saw.
// The agent cannot change any record, close any exception or contact anyone: it only proposes.
import { q, q1 } from "../db";
import { CONTROL_BY_ID, amountSeverity, Severity } from "../controls/catalog";
import { chat, costUsd, addUsage, ZERO, Usage, DEFAULT_MODEL, hasKey, RateLimitError } from "./groq";
import { mask } from "./mask";
import { checkFaithfulness, Faithfulness } from "./verify";

export const PROMPT_VERSION = "triage-agent-v4";
const MAX_STEPS = 4; // model calls
const LOOKUP_BUDGET = 3; // tool lookups before the agent is told to submit

export interface Assessment {
  disposition: "breach" | "false_positive" | "needs_more_info";
  severity: Severity | null;
  confidence: number;
  explanation: string;
  evidence_cited: string[];
  root_cause: string;
  recommended_action: string;
  mode: "agent" | "single-call" | "offline";
  faithfulness: Faithfulness;
  model: string;
  prompt_version: string;
  steps_used: number;
  masked_fields: number;
}

export const SYSTEM_PROMPT = `You are the investigation agent inside a continuous control monitoring tool used by the Internal Audit department of a food manufacturer in Pakistan.
A deterministic rule has raised an exception against one control. Rules are deliberately broad, so some exceptions are legitimate (false positives). Your job is to investigate this ONE exception and propose an assessment for a human audit supervisor, who will confirm or override it. You never close anything yourself.

How to work:
- Read the control, its policy, the rule result and the evidence.
- If a related record is listed, or an ID in the evidence could confirm or explain the exception (a payment, a bank-change request, an employee's HR record, a contract), look it up with get_record before deciding. You have a budget of at most ${LOOKUP_BUDGET} lookups; most exceptions need 0-2.
- Do not search for documents that nothing in the evidence refers to. The evidence fields are complete extracts: if an approval, note or reference field is empty (null), that document does not exist. Do not repeat a lookup.
- Decide the disposition:
  * "breach": the evidence shows the control failed.
  * "false_positive": the evidence contains a specific, documented legitimate explanation that matches the control's accepted explanations (quote it).
  * "needs_more_info": the evidence is insufficient either way.
  Never clear an exception on assumption. Absence of evidence is not a legitimate explanation. Missing approval = breach.
- For a breach, apply the control's severity rubric exactly, using the amounts in the evidence. For false_positive or needs_more_info, severity is null.
- Confidence (0-1) must reflect how strongly the evidence supports your disposition.
- Cite only record IDs, dates and amounts that appear in the evidence or tool results. Never invent figures, names or documents. Identity, bank and tax numbers are masked; do not try to reconstruct them.
- Write for an auditor: plain English, 2-4 sentences, specific.
Finish by calling submit_assessment exactly once.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_record",
      description: "Fetch one record by its ID: transaction records (PO-, APV-, GRN-, PMT-, BCR-, SO-, WO-, TRP-, PSL-, ATT-, UAR-, JE-) or master data (V- vendor, C- customer, E- employee, CT- contract, RT- route, U- ERP user). Returns masked data.",
      parameters: { type: "object", properties: { record_id: { type: "string" } }, required: ["record_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_records",
      description: "Find transaction records of one type where a field equals a value, e.g. all payments with vendor_id = V-1003, or invoices with po_id = PO-004-0012. Max 8 results, masked.",
      parameters: {
        type: "object",
        properties: {
          record_type: { type: "string", enum: ["purchase_order", "goods_receipt", "invoice", "payment", "bank_change", "sales_order", "write_off", "freight_bill", "payslip", "attendance", "user_access", "journal"] },
          field: { type: "string" },
          value: { type: "string" },
        },
        required: ["record_type", "field", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_assessment",
      description: "Submit your final assessment of this exception. Call exactly once.",
      parameters: {
        type: "object",
        properties: {
          disposition: { type: "string", enum: ["breach", "false_positive", "needs_more_info"] },
          severity: { type: ["string", "null"], enum: ["High", "Medium", "Low", null] },
          confidence: { type: "number", description: "0 to 1" },
          explanation: { type: "string", description: "2-4 sentences for the auditor, citing record IDs and amounts from the evidence" },
          evidence_cited: { type: "array", items: { type: "string" }, description: "Record IDs relied on" },
          root_cause: { type: "string", description: "Most likely root cause, one sentence" },
          recommended_action: { type: "string", description: "Corrective action for the process owner, one or two sentences" },
        },
        required: ["disposition", "severity", "confidence", "explanation", "evidence_cited", "root_cause", "recommended_action"],
      },
    },
  },
];

async function lookupRecord(id: string) {
  const r = await q1<{ type: string; data: any; batch_no: number }>("SELECT type, data, batch_no FROM records WHERE id=$1", [id]);
  if (r) return { record_type: r.type, batch: r.batch_no, ...r.data };
  const m = await q1<{ type: string; data: any }>("SELECT type, data FROM master_data WHERE id=$1", [id]);
  if (m) return { record_type: m.type, ...m.data };
  return { error: `No record with id ${id}` };
}

async function runTool(name: string, args: any, counter: { n: number }) {
  if (name === "get_record") return mask(await lookupRecord(String(args.record_id || "").trim()), counter);
  if (name === "search_records") {
    const field = String(args.field || "").replace(/[^a-z_]/gi, "");
    const rows = await q<{ data: any }>(`SELECT data FROM records WHERE type=$1 AND data->>'${field}' = $2 ORDER BY batch_no DESC LIMIT 8`, [args.record_type, String(args.value)]);
    return mask({ count: rows.length, results: rows.map((r) => r.data) }, counter);
  }
  return { error: `Unknown tool ${name}` };
}

export function buildUserPrompt(exc: any, evidenceMasked: any) {
  const c = CONTROL_BY_ID[exc.control_id];
  return `EXCEPTION ${exc.ref} (batch ${exc.batch_no})
Control: ${c.id} ${c.name} - ${c.process}
Risk: ${c.risk}
Control statement: ${c.controlStatement}
Rule: ${c.ruleDescription}
Accepted legitimate explanations: ${c.legitimateExplanations}
Severity rubric: ${c.severityRubric}

Rule result: ${exc.rule_detail}
Rule estimate of amount at risk: PKR ${Number(exc.amount_at_risk).toLocaleString("en-US")}

Evidence (masked):
${JSON.stringify(evidenceMasked)}

Related records you may look up: ${(exc.related || []).map((r: any) => `${r.id} (${r.type}: ${r.why})`).join("; ") || "none listed (you may still look up IDs that appear in the evidence)"}`;
}

function normalise(a: any): Omit<Assessment, "mode" | "faithfulness" | "model" | "prompt_version" | "steps_used" | "masked_fields"> {
  const disp = ["breach", "false_positive", "needs_more_info"].includes(a?.disposition) ? a.disposition : "needs_more_info";
  const sev = disp === "breach" && ["High", "Medium", "Low"].includes(a?.severity) ? a.severity : disp === "breach" ? "Medium" : null;
  return {
    disposition: disp, severity: sev, confidence: Math.max(0, Math.min(1, Number(a?.confidence) || 0)),
    explanation: String(a?.explanation || "").slice(0, 2000), evidence_cited: Array.isArray(a?.evidence_cited) ? a.evidence_cited.map(String).slice(0, 20) : [],
    root_cause: String(a?.root_cause || "").slice(0, 600), recommended_action: String(a?.recommended_action || "").slice(0, 800),
  };
}

function offlineAssessment(exc: any): Assessment {
  return {
    disposition: "needs_more_info", severity: amountSeverity(Number(exc.amount_at_risk)), confidence: 0,
    explanation: `AI investigation unavailable (no model key configured). Rule result: ${exc.rule_detail}`,
    evidence_cited: exc.record_ids, root_cause: "Not assessed", recommended_action: "Supervisor to investigate manually.",
    mode: "offline", faithfulness: { ok: true, checked: 0, unverified: [], ids: [], dates: [], amounts: [] }, model: "none", prompt_version: PROMPT_VERSION, steps_used: 0, masked_fields: 0,
  };
}

export interface AgentOutcome { assessment: Assessment; usage: Usage; cost_usd: number; latency_ms: number; steps: any[]; llm_calls: number }

/** Run the agent on one exception row (does not persist). mode "single" = prompt v1 baseline without tools. */
export async function investigate(exc: any, opts: { mode?: "agent" | "single"; model?: string } = {}): Promise<AgentOutcome> {
  if (!hasKey()) return { assessment: offlineAssessment(exc), usage: ZERO, cost_usd: 0, latency_ms: 0, steps: [], llm_calls: 0 };
  const model = opts.model || DEFAULT_MODEL;
  const counter = { n: 0 };
  const evidence = mask(exc.evidence, counter);
  const userPrompt = buildUserPrompt(exc, evidence);
  const steps: any[] = [{ type: "context", masked_fields: counter.n, prompt_chars: userPrompt.length }];
  const corpusParts: string[] = [userPrompt];
  let usage: Usage = ZERO;
  let calls = 0;
  const t0 = Date.now();

  if (opts.mode === "single") {
    // Prompt v1 baseline (kept for the evaluation comparison): one call, JSON answer, no tools.
    const r = await chat({
      model,
      messages: [
        { role: "system", content: "You are an internal audit assistant. Assess the exception and reply with JSON only: {disposition: breach|false_positive|needs_more_info, severity: High|Medium|Low|null, confidence: 0-1, explanation, evidence_cited: [], root_cause, recommended_action}." },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });
    calls++;
    usage = addUsage(usage, r.usage);
    let parsed: any = {};
    try { parsed = JSON.parse(r.message.content || "{}"); } catch { parsed = {}; }
    const a = normalise(parsed);
    const f = checkFaithfulness(`${a.explanation} ${a.root_cause} ${a.recommended_action}`, corpusParts.join("\n"));
    steps.push({ type: "llm", step: 1, latency_ms: r.latency_ms, usage: r.usage, content: r.message.content });
    return { assessment: { ...a, mode: "single-call", faithfulness: f, model, prompt_version: "triage-single-v1", steps_used: 1, masked_fields: counter.n }, usage, cost_usd: costUsd(model, usage), latency_ms: Date.now() - t0, steps, llm_calls: calls };
  }

  const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }];
  let submitted: any = null;
  let lookups = 0;
  const SUBMIT_ONLY = TOOLS.filter((t) => t.function.name === "submit_assessment");
  for (let step = 1; step <= MAX_STEPS && !submitted; step++) {
    // v3 failure: forcing tool_choice on the last step was ignored by the model (Groq 400 tool_use_failed).
    // v4: once the budget is spent or on the last step, offer ONLY the submit tool.
    const last = step === MAX_STEPS || lookups >= LOOKUP_BUDGET;
    let r;
    try {
      r = await chat({ model, messages, tools: last ? SUBMIT_ONLY : TOOLS, tool_choice: last ? "required" : "auto" });
    } catch (e: any) {
      if (e instanceof RateLimitError) throw e;
      // malformed tool call etc.: record and retry once with a nudge
      steps.push({ type: "error", step, error: String(e.message).slice(0, 300) });
      messages.push({ role: "user", content: "Your previous reply could not be parsed. Call submit_assessment with valid JSON arguments." });
      continue;
    }
    calls++;
    usage = addUsage(usage, r.usage);
    const msg = r.message;
    const toolCalls = msg.tool_calls || [];
    steps.push({ type: "llm", step, latency_ms: r.latency_ms, usage: r.usage, content: msg.content || null, reasoning: msg.reasoning ? String(msg.reasoning).slice(0, 1200) : null, tool_calls: toolCalls.map((t: any) => ({ name: t.function?.name, arguments: t.function?.arguments })) });
    if (!toolCalls.length) {
      messages.push({ role: "assistant", content: msg.content || "" });
      messages.push({ role: "user", content: "Call submit_assessment now with your assessment." });
      continue;
    }
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { args = {}; }
      if (tc.function?.name === "submit_assessment") {
        submitted = args;
        messages.push({ role: "tool", tool_call_id: tc.id, content: "Assessment received." });
        continue;
      }
      lookups++;
      const result = lookups > LOOKUP_BUDGET ? { error: "Lookup budget used. Submit your assessment now." } : await runTool(tc.function?.name, args, counter);
      const text = JSON.stringify(result);
      corpusParts.push(text);
      steps.push({ type: "tool", step, name: tc.function?.name, arguments: args, result_preview: text.slice(0, 600) });
      messages.push({ role: "tool", tool_call_id: tc.id, content: text.slice(0, 6000) });
    }
    if (!submitted && lookups >= LOOKUP_BUDGET) messages.push({ role: "user", content: "Lookup budget used. Call submit_assessment now based on what you have." });
  }
  const a = normalise(submitted || {});
  if (!submitted) { a.explanation = "Agent did not submit an assessment within the step limit. " + exc.rule_detail; a.confidence = 0; }
  const f = checkFaithfulness(`${a.explanation} ${a.root_cause} ${a.recommended_action}`, corpusParts.join("\n"));
  return {
    assessment: { ...a, mode: "agent", faithfulness: f, model, prompt_version: PROMPT_VERSION, steps_used: steps.filter((s) => s.type === "llm").length, masked_fields: counter.n },
    usage, cost_usd: costUsd(model, usage), latency_ms: Date.now() - t0, steps, llm_calls: calls,
  };
}

/** Claim the next NEW exception, investigate it and persist the proposal. Returns null when the queue is empty. */
export async function processNext(actor = "agent-worker", maxBatch?: number): Promise<any | null> {
  await q("UPDATE exceptions SET status='NEW', claimed_at=NULL WHERE status='AI_RUNNING' AND claimed_at < now() - interval '3 minutes'");
  const exc = await q1(
    `UPDATE exceptions SET status='AI_RUNNING', claimed_at=now(), ai_attempts=ai_attempts+1
     WHERE id = (SELECT id FROM exceptions WHERE status='NEW' AND batch_no <= $1 ORDER BY batch_no, id LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [maxBatch ?? 2147483647],
  );
  if (!exc) return null;
  try {
    const out = await investigate(exc);
    await q("UPDATE exceptions SET status='PENDING_REVIEW', ai=$2, ai_model=$3, ai_at=now(), claimed_at=NULL WHERE id=$1", [exc.id, JSON.stringify(out.assessment), out.assessment.model]);
    await q(
      `INSERT INTO agent_runs (exception_id, kind, model, prompt_version, steps, prompt_tokens, completion_tokens, cached_tokens, total_tokens, llm_calls, cost_usd, latency_ms, ok)
       VALUES ($1,'triage',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
      [exc.id, out.assessment.model, out.assessment.prompt_version, JSON.stringify(out.steps), out.usage.prompt_tokens, out.usage.completion_tokens, out.usage.cached_tokens, out.usage.total_tokens, out.llm_calls, out.cost_usd, out.latency_ms],
    );
    await q("INSERT INTO audit_log (actor, role, action, entity, detail) VALUES ($1,'agent','AI_PROPOSAL',$2,$3)", [actor, exc.ref, `${out.assessment.disposition}${out.assessment.severity ? " / " + out.assessment.severity : ""} (confidence ${out.assessment.confidence.toFixed(2)})${out.assessment.faithfulness.ok ? "" : " - faithfulness check FAILED"}`]);
    return { ref: exc.ref, id: exc.id, control_id: exc.control_id, title: exc.title, assessment: out.assessment, tokens: out.usage.total_tokens, cost_usd: out.cost_usd, latency_ms: out.latency_ms };
  } catch (e: any) {
    await q("UPDATE exceptions SET status='NEW', claimed_at=NULL WHERE id=$1", [exc.id]);
    await q("INSERT INTO agent_runs (exception_id, kind, model, ok, error) VALUES ($1,'triage',$2,false,$3)", [exc.id, DEFAULT_MODEL, String(e.message).slice(0, 500)]);
    throw e;
  }
}
