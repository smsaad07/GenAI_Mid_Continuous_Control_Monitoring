// Evaluation against the seeded ground truth (Phase 1 rows 7 and 7a).
// Ground truth is written by the synthetic generator and is never shown to the agent.
import { q } from "./db";
import { CONTROLS } from "./controls/catalog";

interface ExcRow { id: number; ref: string; batch_no: number; control_id: string; record_ids: string[]; status: string; ai: any; sup_decision: string | null; sup_severity: string | null; amount_at_risk: string }
interface GtRow { batch_no: number; control_id: string; kind: string; record_ids: string[]; expected_severity: string | null }

const pct = (a: number, b: number) => (b ? a / b : null);

export async function computeEval(opts: { batches?: number[] } = {}) {
  const filter = opts.batches?.length ? "WHERE batch_no = ANY($1)" : "";
  const params = opts.batches?.length ? [opts.batches] : [];
  const exc = await q<ExcRow>(`SELECT id, ref, batch_no, control_id, record_ids, status, ai, sup_decision, sup_severity, amount_at_risk FROM exceptions ${filter}`, params);
  const gt = await q<GtRow>(`SELECT batch_no, control_id, kind, record_ids, expected_severity FROM ground_truth ${filter}`, params);
  const runs = await q<{ control_id: string; population: number }>(`SELECT control_id, population FROM control_runs ${filter}`, params);

  const key = (b: number, c: string) => `${b}|${c}`;
  const gtBy: Record<string, GtRow[]> = {};
  for (const g of gt) (gtBy[key(g.batch_no, g.control_id)] ||= []).push(g);
  const match = (e: ExcRow) => (gtBy[key(e.batch_no, e.control_id)] || []).find((g) => g.record_ids.some((id) => e.record_ids.includes(id)));

  const labelled = exc.map((e) => ({ e, g: match(e) }));
  const per: Record<string, any> = {};
  for (const c of CONTROLS) per[c.id] = { control_id: c.id, name: c.name, process: c.process, breaches: 0, detected: 0, decoys: 0, decoys_flagged: 0, exceptions: 0, true_exceptions: 0, ai_assessed: 0, ai_correct: 0, false_clears: 0, false_alarms: 0, sev_n: 0, sev_agree: 0, population: 0 };
  for (const r of runs) per[r.control_id].population += r.population;

  for (const g of gt) {
    const p = per[g.control_id];
    const hit = exc.some((e) => e.batch_no === g.batch_no && e.control_id === g.control_id && g.record_ids.some((id) => e.record_ids.includes(id)));
    if (g.kind === "breach") { p.breaches++; if (hit) p.detected++; } else { p.decoys++; if (hit) p.decoys_flagged++; }
  }

  // AI metrics
  let assessed = 0, correct = 0, nmi = 0, gtBreachAssessed = 0, falseClear = 0, hcBreach = 0, hcFalseClear = 0, benignAssessed = 0, falseAlarm = 0, benignCleared = 0;
  let aiBreach = 0, aiBreachTrue = 0, sevN = 0, sevAgree = 0, faithN = 0, faithOk = 0, e2eFound = 0;
  const conf: { bucket: string; n: number; correct: number }[] = [
    { bucket: "0.0-0.6", n: 0, correct: 0 }, { bucket: "0.6-0.8", n: 0, correct: 0 }, { bucket: "0.8-0.9", n: 0, correct: 0 }, { bucket: "0.9-1.0", n: 0, correct: 0 },
  ];
  const errors: any[] = [];
  const breachExcByGt = new Map<GtRow, ExcRow[]>();
  for (const { e, g } of labelled) {
    const p = per[e.control_id];
    p.exceptions++;
    const isBreach = g?.kind === "breach";
    if (isBreach) { p.true_exceptions++; breachExcByGt.set(g!, [...(breachExcByGt.get(g!) || []), e]); }
    const a = e.ai;
    if (!a || a.mode === "offline") continue;
    assessed++; p.ai_assessed++;
    faithN++; if (a.faithfulness?.ok) faithOk++;
    const d = a.disposition;
    if (d === "needs_more_info") nmi++;
    const ok = (isBreach && d === "breach") || (!isBreach && d === "false_positive");
    if (ok) { correct++; p.ai_correct++; }
    const b = a.confidence >= 0.9 ? 3 : a.confidence >= 0.8 ? 2 : a.confidence >= 0.6 ? 1 : 0;
    conf[b].n++; if (ok) conf[b].correct++;
    if (isBreach) {
      gtBreachAssessed++;
      if (d === "false_positive") { falseClear++; p.false_clears++; }
      if (a.confidence >= 0.8) { hcBreach++; if (d === "false_positive") hcFalseClear++; }
      if (d === "breach") {
        sevN++; p.sev_n++;
        if (a.severity === g!.expected_severity) { sevAgree++; p.sev_agree++; }
        else errors.push({ type: "severity", ref: e.ref, control_id: e.control_id, ai: a.severity, expected: g!.expected_severity });
      }
    } else {
      benignAssessed++;
      if (d === "breach") { falseAlarm++; p.false_alarms++; }
      if (d === "false_positive") benignCleared++;
    }
    if (d === "breach") { aiBreach++; if (isBreach) aiBreachTrue++; }
    if (!ok) errors.push({ type: isBreach ? (d === "false_positive" ? "FALSE CLEAR" : "needs info on breach") : d === "breach" ? "false alarm" : "needs info on benign", ref: e.ref, control_id: e.control_id, disposition: d, confidence: a.confidence, explanation: a.explanation });
  }
  const gtBreaches = gt.filter((g) => g.kind === "breach");
  for (const g of gtBreaches) {
    const es = breachExcByGt.get(g) || [];
    if (es.some((e) => e.ai && e.ai.mode !== "offline" && e.ai.disposition !== "false_positive")) e2eFound++;
  }
  const gtBreachesWithAi = gtBreaches.filter((g) => (breachExcByGt.get(g) || []).some((e) => e.ai && e.ai.mode !== "offline")).length;

  // supervisor agreement (human loop)
  const reviewed = exc.filter((e) => e.sup_decision);
  const supAgree = reviewed.filter((e) => e.ai && (e.sup_decision === "confirmed_breach") === (e.ai.disposition === "breach")).length;
  const supConfirmed = reviewed.filter((e) => e.sup_decision === "confirmed_breach").length;

  const cost = await q<any>(`SELECT count(*)::int AS runs, COALESCE(sum(prompt_tokens),0)::int AS prompt_tokens, COALESCE(sum(completion_tokens),0)::int AS completion_tokens,
     COALESCE(sum(cached_tokens),0)::int AS cached_tokens, COALESCE(sum(total_tokens),0)::int AS total_tokens, COALESCE(sum(cost_usd),0)::float AS cost_usd,
     COALESCE(avg(latency_ms),0)::int AS avg_latency_ms, COALESCE(avg(llm_calls),0)::float AS avg_calls,
     COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms),0)::int AS p50_latency_ms,
     COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),0)::int AS p95_latency_ms,
     sum(CASE WHEN ok THEN 0 ELSE 1 END)::int AS failed_runs
     FROM agent_runs WHERE kind='triage' ${opts.batches?.length ? "AND exception_id IN (SELECT id FROM exceptions WHERE batch_no = ANY($1))" : ""}`, params);
  const lag = await q<any>(`SELECT COALESCE(avg(b.window_end - e.txn_date),0)::float AS detect_days, COALESCE(max(b.window_end - e.txn_date),0)::int AS max_detect_days,
     COALESCE(avg(EXTRACT(EPOCH FROM (e.ai_at - e.created_at))),0)::float AS ai_seconds
     FROM exceptions e JOIN batches b ON b.batch_no=e.batch_no ${opts.batches?.length ? "WHERE e.batch_no = ANY($1)" : ""}`, params);

  const ruleRecall = pct(gtBreaches.filter((g) => exc.some((e) => e.batch_no === g.batch_no && e.control_id === g.control_id && g.record_ids.some((id) => e.record_ids.includes(id)))).length, gtBreaches.length);
  const truePositives = labelled.filter((l) => l.g?.kind === "breach").length;

  return {
    scope: { batches: opts.batches?.length ? opts.batches : "all", exceptions: exc.length, ground_truth_breaches: gtBreaches.length, ground_truth_decoys: gt.length - gtBreaches.length, ai_assessed: assessed },
    targets: { rule_recall: 0.95, false_clear_rate: 0.02, severity_agreement: 0.85, faithfulness: 0.95, coverage: 1, ai_precision: 0.7, detect_days: 7 },
    rules: { recall: ruleRecall, precision_vs_breaches: pct(truePositives, exc.length) },
    ai: {
      disposition_accuracy: pct(correct, assessed), needs_more_info_rate: pct(nmi, assessed),
      false_clear_rate: pct(falseClear, gtBreachAssessed), false_clears: falseClear, breach_exceptions_assessed: gtBreachAssessed,
      high_conf_false_clear_rate: pct(hcFalseClear, hcBreach), high_conf_breach_n: hcBreach,
      decoy_clearance_rate: pct(benignCleared, benignAssessed), false_alarm_rate: pct(falseAlarm, benignAssessed), benign_assessed: benignAssessed,
      precision_of_ai_breach: pct(aiBreachTrue, aiBreach), end_to_end_recall: pct(e2eFound, gtBreachesWithAi),
      severity_agreement: pct(sevAgree, sevN), severity_n: sevN, faithfulness: pct(faithOk, faithN), faithfulness_n: faithN,
      calibration: conf,
    },
    human: { reviewed: reviewed.length, supervisor_ai_agreement: pct(supAgree, reviewed.length), supervisor_confirmed_precision: pct(supConfirmed, reviewed.length) },
    coverage: { tested: runs.reduce((s, r) => s + r.population, 0), rate: 1 },
    timeliness: lag[0],
    cost: cost[0],
    per_control: Object.values(per).map((p: any) => ({ ...p, recall: pct(p.detected, p.breaches), ai_accuracy: pct(p.ai_correct, p.ai_assessed), severity_agreement: pct(p.sev_agree, p.sev_n) })),
    errors: errors.slice(0, 60),
  };
}
