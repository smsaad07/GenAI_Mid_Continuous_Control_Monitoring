// Offline check: generate N batches, run the rule tests and score rule recall/precision against ground truth.
import { generateMaster } from "../lib/synth/master";
import { generateBatch } from "../lib/synth/batch";
import { runAllTests } from "../lib/controls/tests";
const N = Number(process.argv[2] || 20);
const m = generateMaster();
const per: Record<string, { breaches: number; found: number; decoys: number; decoyFlagged: number; cands: number; tp: number; other: number; ver: string }> = {};
let recs = 0;
for (let n = 1; n <= N; n++) {
  const b = generateBatch(n, m);
  recs += Object.values(b.records).reduce((s, a) => s + a.length, 0);
  for (const t of runAllTests(b.records, m)) {
    const s = (per[t.control_id] ||= { breaches: 0, found: 0, decoys: 0, decoyFlagged: 0, cands: 0, tp: 0, other: 0, ver: t.rule_version });
    const gts = b.truth.filter((g) => g.control_id === t.control_id);
    s.cands += t.candidates.length;
    for (const g of gts) {
      const hit = t.candidates.some((c) => c.record_ids.some((id) => g.record_ids.includes(id)));
      if (g.kind === "breach") { s.breaches++; if (hit) s.found++; } else { s.decoys++; if (hit) s.decoyFlagged++; }
    }
    for (const c of t.candidates) {
      const g = gts.find((g) => c.record_ids.some((id) => g.record_ids.includes(id)));
      if (g?.kind === "breach") s.tp++; else if (!g) s.other++;
    }
  }
}
console.log(`batches=${N} records=${recs}`);
console.log("control  ver                         breaches found recall | decoys flagged | candidates tp unexplained");
for (const [k, s] of Object.entries(per)) console.log(k.padEnd(8), s.ver.padEnd(27), String(s.breaches).padStart(8), String(s.found).padStart(5), (s.breaches ? (100 * s.found / s.breaches).toFixed(0) + "%" : "-").padStart(6), "|", String(s.decoys).padStart(6), String(s.decoyFlagged).padStart(7), "|", String(s.cands).padStart(10), String(s.tp).padStart(3), String(s.other).padStart(11));
