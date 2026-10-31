// Deterministic control tests. Rules are deliberately broad (built for recall);
// the investigation agent then reads the evidence to separate true breaches
// from legitimate explanations. Every record of the relevant type is tested
// (100% population coverage), not a sample.
import { Master } from "../synth/master";
import { Rec } from "../synth/batch";
import { daysBetween } from "../rng";
import {
  APPROVAL_LIMIT_PO, PRICE_TOLERANCE, WRITE_OFF_THRESHOLD, DISCOUNT_LIMIT, FREIGHT_KM_TOLERANCE,
  WEEKLY_HOURS_LIMIT, JE_APPROVAL_THRESHOLD, BANK_CHANGE_WINDOW_DAYS, DUPLICATE_WINDOW_DAYS, MIN_WAGE,
} from "./catalog";
import { ROLE_CONFLICTS } from "../synth/master";

export interface Candidate {
  control_id: string;
  record_ids: string[];
  primary_record_id: string;
  title: string;
  rule_detail: string;
  amount_at_risk: number;
  txn_date: string;
  evidence: Record<string, Rec[]>; // records the rule used, grouped by type
  related: { type: string; id: string; why: string }[]; // records the agent may look up
}

export interface TestResult {
  control_id: string;
  rule_version: string;
  population: number; // records tested
  candidates: Candidate[];
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
// v2 normalisation: strip punctuation/spaces/leading zeros and upper-case
export const normRef = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z]+)0+/, "$1");

export const RULE_VERSIONS: Record<string, string> = {};

type Records = Record<string, Rec[]>;
type TestFn = (R: Records, m: Master) => Omit<TestResult, "control_id" | "rule_version">;

const TESTS: Record<string, { version: string; fn: TestFn }> = {
  "P2P-01": {
    version: "v2 (normalised ref OR same amount within 45 days)",
    fn: (R) => {
      const inv = R.invoice;
      const out: Candidate[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < inv.length; i++) for (let j = i + 1; j < inv.length; j++) {
        const a = inv[i], b = inv[j];
        if (a.vendor_id !== b.vendor_id) continue;
        // v1 compared raw references and missed "INV-123"/"inv/123" and transposed digits (recall 30%).
        // v2: normalised reference match, OR same gross amount within the duplicate window.
        const sameRef = normRef(a.vendor_invoice_ref) === normRef(b.vendor_invoice_ref);
        const sameAmt = a.gross_amount === b.gross_amount && Math.abs(daysBetween(a.invoice_date, b.invoice_date)) <= DUPLICATE_WINDOW_DAYS;
        if (!sameRef && !sameAmt) continue;
        const key = [a.id, b.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        const [first, second] = a.invoice_date <= b.invoice_date ? [a, b] : [b, a];
        out.push({
          control_id: "P2P-01", record_ids: [first.id, second.id], primary_record_id: second.id,
          title: `Possible duplicate invoice: ${a.vendor_name}, PKR ${fmt(second.gross_amount)}`,
          rule_detail: `Invoices ${first.id} (ref ${first.vendor_invoice_ref}, ${first.invoice_date}) and ${second.id} (ref ${second.vendor_invoice_ref}, ${second.invoice_date}) ${sameRef ? "share the same normalised invoice reference" : "have the same vendor and gross amount within " + DUPLICATE_WINDOW_DAYS + " days"}.`,
          amount_at_risk: second.gross_amount, txn_date: second.invoice_date, evidence: { invoice: [first, second] },
          related: [first.payment_id, second.payment_id].filter(Boolean).map((id: string) => ({ type: "payment", id, why: "payment of the invoice" })),
        });
      }
      return { population: inv.length, candidates: out };
    },
  },
  "P2P-02": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      const groups: Record<string, Rec[]> = {};
      for (const p of R.purchase_order) if (p.po_value < APPROVAL_LIMIT_PO) (groups[`${p.requester_id}|${p.vendor_id}`] ||= []).push(p);
      for (const g of Object.values(groups)) {
        if (g.length < 2) continue;
        g.sort((a, b) => a.po_date.localeCompare(b.po_date));
        if (daysBetween(g[0].po_date, g[g.length - 1].po_date) > 7) continue;
        const total = g.reduce((s, p) => s + p.po_value, 0);
        if (total <= APPROVAL_LIMIT_PO) continue;
        out.push({
          control_id: "P2P-02", record_ids: g.map((p) => p.id), primary_record_id: g[0].id,
          title: `Possible split POs: ${g[0].vendor_name}, total PKR ${fmt(total)}`,
          rule_detail: `${g.length} POs (${g.map((p) => p.id).join(", ")}) by ${g[0].requester} to ${g[0].vendor_name} between ${g[0].po_date} and ${g[g.length - 1].po_date}, each below PKR ${fmt(APPROVAL_LIMIT_PO)}, total PKR ${fmt(total)}.`,
          amount_at_risk: total, txn_date: g[0].po_date, evidence: { purchase_order: g }, related: [],
        });
      }
      return { population: R.purchase_order.length, candidates: out };
    },
  },
  "P2P-03": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const p of R.purchase_order) {
        if (p.unit_price <= p.contract_price * (1 + PRICE_TOLERANCE)) continue;
        const excess = (p.unit_price - p.contract_price) * p.quantity;
        out.push({
          control_id: "P2P-03", record_ids: [p.id], primary_record_id: p.id,
          title: `PO above contract price: ${p.vendor_name}, ${p.material_name}`,
          rule_detail: `${p.id}: unit price PKR ${fmt(p.unit_price)} vs contract ${p.contract_id} price PKR ${fmt(p.contract_price)} (+${(((p.unit_price / p.contract_price) - 1) * 100).toFixed(1)}%), quantity ${p.quantity}, excess PKR ${fmt(excess)}.`,
          amount_at_risk: excess, txn_date: p.po_date, evidence: { purchase_order: [p] }, related: [{ type: "contract", id: p.contract_id, why: "contract price" }],
        });
      }
      return { population: R.purchase_order.length, candidates: out };
    },
  },
  "P2P-04": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      const grnById = Object.fromEntries(R.goods_receipt.map((g) => [g.id, g]));
      const poById = Object.fromEntries(R.purchase_order.map((p) => [p.id, p]));
      let pop = 0;
      for (const inv of R.invoice) {
        if (!inv.po_id) continue;
        pop++;
        const po = poById[inv.po_id];
        const received = (inv.grn_ids || []).reduce((s: number, id: string) => s + (grnById[id]?.quantity_received || 0), 0);
        const qtyFail = inv.quantity > received;
        const priceFail = po && inv.unit_price > po.unit_price * 1.01;
        if (!qtyFail && !priceFail) continue;
        const excess = qtyFail ? (inv.quantity - received) * inv.unit_price : (inv.unit_price - po.unit_price) * inv.quantity;
        out.push({
          control_id: "P2P-04", record_ids: [inv.id, inv.po_id, ...(inv.grn_ids || [])], primary_record_id: inv.id,
          title: `Three-way match failure: ${inv.vendor_name}, PKR ${fmt(excess)} over-billed`,
          rule_detail: `Invoice ${inv.id} quantity ${inv.quantity} vs goods received ${received} (${(inv.grn_ids || []).join(", ")}) on ${inv.po_id}; excess value PKR ${fmt(excess)}.`,
          amount_at_risk: excess, txn_date: inv.invoice_date,
          evidence: { invoice: [inv], purchase_order: po ? [po] : [], goods_receipt: (inv.grn_ids || []).map((id: string) => grnById[id]).filter(Boolean) },
          related: inv.payment_id ? [{ type: "payment", id: inv.payment_id, why: "payment against the invoice" }] : [],
        });
      }
      return { population: pop, candidates: out };
    },
  },
  "P2P-05": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const bc of R.bank_change) {
        const pays = R.payment.filter((p) => p.vendor_id === bc.vendor_id && p.payment_date >= bc.change_date && daysBetween(bc.change_date, p.payment_date) <= BANK_CHANGE_WINDOW_DAYS);
        if (!pays.length) continue;
        const amt = pays.reduce((s, p) => s + p.amount, 0);
        out.push({
          control_id: "P2P-05", record_ids: [bc.id, ...pays.map((p) => p.id)], primary_record_id: bc.id,
          title: `Payment soon after bank change: ${bc.vendor_name}, PKR ${fmt(amt)}`,
          rule_detail: `Bank account of ${bc.vendor_id} changed on ${bc.change_date} (${bc.id}); ${pays.length} payment(s) ${pays.map((p) => p.id).join(", ")} totalling PKR ${fmt(amt)} within ${BANK_CHANGE_WINDOW_DAYS} days.`,
          amount_at_risk: amt, txn_date: pays[0].payment_date, evidence: { payment: pays },
          related: [{ type: "bank_change", id: bc.id, why: "the bank-detail change request and its verification" }],
        });
      }
      return { population: R.payment.length, candidates: out };
    },
  },
  "O2C-01": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const so of R.sales_order) {
        const exposure = so.outstanding_before + so.order_value;
        if (exposure <= so.credit_limit || so.status !== "Released") continue;
        const excess = exposure - so.credit_limit;
        out.push({
          control_id: "O2C-01", record_ids: [so.id], primary_record_id: so.id,
          title: `Credit limit exceeded: ${so.customer_name}, PKR ${fmt(excess)} over`,
          rule_detail: `${so.id}: outstanding PKR ${fmt(so.outstanding_before)} + order PKR ${fmt(so.order_value)} = PKR ${fmt(exposure)} vs credit limit PKR ${fmt(so.credit_limit)}; released by ${so.released_by}.`,
          amount_at_risk: excess, txn_date: so.so_date, evidence: { sales_order: [so] }, related: [{ type: "customer", id: so.customer_id, why: "customer master" }],
        });
      }
      return { population: R.sales_order.length, candidates: out };
    },
  },
  "O2C-02": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const so of R.sales_order) {
        if (so.net_price >= so.list_price * (1 - DISCOUNT_LIMIT)) continue;
        const excess = (so.list_price * (1 - DISCOUNT_LIMIT) - so.net_price) * so.quantity_cartons;
        out.push({
          control_id: "O2C-02", record_ids: [so.id], primary_record_id: so.id,
          title: `Discount above limit: ${so.customer_name}, ${so.discount_pct}% on ${so.sku}`,
          rule_detail: `${so.id}: net price PKR ${fmt(so.net_price)} vs list PKR ${fmt(so.list_price)} (${so.discount_pct}% discount) on ${so.quantity_cartons} cartons; discount beyond 10% = PKR ${fmt(excess)}.`,
          amount_at_risk: excess, txn_date: so.so_date, evidence: { sales_order: [so] }, related: [],
        });
      }
      return { population: R.sales_order.length, candidates: out };
    },
  },
  "INV-01": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const w of R.write_off) {
        if (w.value <= WRITE_OFF_THRESHOLD) continue;
        const self = w.approved_by === w.requested_by;
        if (w.approver_role === "Plant Manager" && !self) continue;
        out.push({
          control_id: "INV-01", record_ids: [w.id], primary_record_id: w.id,
          title: `Write-off not approved by Plant Manager: ${w.plant}, PKR ${fmt(w.value)}`,
          rule_detail: `${w.id}: write-off of PKR ${fmt(w.value)} requested by ${w.requested_by}, approved by ${w.approved_by} (${w.approver_role})${self ? " - approver is the requester" : ""}.`,
          amount_at_risk: w.value, txn_date: w.date, evidence: { write_off: [w] }, related: [],
        });
      }
      return { population: R.write_off.length, candidates: out };
    },
  },
  "LOG-01": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const t of R.freight_bill) {
        if (t.billed_km <= t.standard_km * (1 + FREIGHT_KM_TOLERANCE)) continue;
        const excess = (t.billed_km - t.standard_km) * t.rate_per_km;
        out.push({
          control_id: "LOG-01", record_ids: [t.id], primary_record_id: t.id,
          title: `Freight km above standard: ${t.transporter_name}, ${t.origin}-${t.destination}`,
          rule_detail: `${t.id}: billed ${fmt(t.billed_km)} km vs standard ${fmt(t.standard_km)} km on route ${t.route_id} (+${(((t.billed_km / t.standard_km) - 1) * 100).toFixed(1)}%); excess PKR ${fmt(excess)} at PKR ${t.rate_per_km}/km.`,
          amount_at_risk: excess, txn_date: t.trip_date, evidence: { freight_bill: [t] }, related: [{ type: "route", id: t.route_id, why: "standard route" }],
        });
      }
      return { population: R.freight_bill.length, candidates: out };
    },
  },
  "PAY-01": {
    version: "v1 (no pro-rata adjustment)",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const p of R.payslip) {
        if (p.pay_type !== "Regular salary") continue;
        const min = MIN_WAGE[p.province];
        if (p.gross_pay >= min) continue;
        out.push({
          control_id: "PAY-01", record_ids: [p.id], primary_record_id: p.id,
          title: `Wage below minimum: ${p.employee_id} (${p.plant}), PKR ${fmt(p.gross_pay)}`,
          rule_detail: `${p.id}: gross pay PKR ${fmt(p.gross_pay)} for ${p.period} vs ${p.province} minimum wage PKR ${fmt(min)}; shortfall PKR ${fmt(min - p.gross_pay)}.`,
          amount_at_risk: min - p.gross_pay, txn_date: p.pay_date, evidence: { payslip: [p] }, related: [{ type: "employee", id: p.employee_id, why: "employee master (contract, hours)" }],
        });
      }
      return { population: R.payslip.length, candidates: out };
    },
  },
  "PAY-02": {
    version: "v1",
    fn: (R, m) => {
      const out: Candidate[] = [];
      const emp = Object.fromEntries(m.employees.map((e) => [e.id, e]));
      for (const p of R.payslip) {
        const e = emp[p.employee_id];
        if (!e || e.status !== "Terminated" || !e.termination_date || p.pay_date <= e.termination_date) continue;
        out.push({
          control_id: "PAY-02", record_ids: [p.id], primary_record_id: p.id,
          title: `Payment after termination: ${p.employee_id}, PKR ${fmt(p.gross_pay)}`,
          rule_detail: `${p.id}: PKR ${fmt(p.gross_pay)} paid on ${p.pay_date} to ${p.employee_id}, terminated on ${e.termination_date}.`,
          amount_at_risk: p.gross_pay, txn_date: p.pay_date, evidence: { payslip: [p] }, related: [{ type: "employee", id: p.employee_id, why: "HR status and leaver details" }],
        });
      }
      return { population: R.payslip.length, candidates: out };
    },
  },
  "PAY-03": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const a of R.attendance) {
        if (a.total_hours <= WEEKLY_HOURS_LIMIT) continue;
        out.push({
          control_id: "PAY-03", record_ids: [a.id], primary_record_id: a.id,
          title: `Excessive hours: ${a.employee_id} (${a.plant}), ${a.total_hours} h`,
          rule_detail: `${a.id}: ${a.total_hours} hours in week starting ${a.week_start} (limit ${WEEKLY_HOURS_LIMIT}); overtime ${a.overtime_hours} h.`,
          amount_at_risk: 0, txn_date: a.week_start, evidence: { attendance: [a] }, related: [{ type: "employee", id: a.employee_id, why: "employee master" }],
        });
      }
      return { population: R.attendance.length, candidates: out };
    },
  },
  "ITA-01": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const u of R.user_access) {
        const hits = ROLE_CONFLICTS.filter(([a, b]) => u.roles.includes(a) && u.roles.includes(b));
        if (!hits.length || u.account_status !== "Active") continue;
        out.push({
          control_id: "ITA-01", record_ids: [u.id], primary_record_id: u.id,
          title: `SoD conflict: ${u.username} holds ${hits.map((h) => h.join(" + ")).join("; ")}`,
          rule_detail: `${u.id}: user ${u.user_id} (${u.username}, ${u.department}) holds conflicting roles ${hits.map((h) => h.join(" + ")).join("; ")}.`,
          amount_at_risk: 0, txn_date: u.snapshot_date, evidence: { user_access: [u] }, related: [],
        });
      }
      return { population: R.user_access.length, candidates: out };
    },
  },
  "ITA-02": {
    version: "v1",
    fn: (R, m) => {
      const out: Candidate[] = [];
      const emp = Object.fromEntries(m.employees.map((e) => [e.id, e]));
      for (const u of R.user_access) {
        const e = emp[u.employee_id];
        if (!e || e.status !== "Terminated" || u.account_status !== "Active") continue;
        out.push({
          control_id: "ITA-02", record_ids: [u.id], primary_record_id: u.id,
          title: `Leaver with active ERP account: ${u.username}`,
          rule_detail: `${u.id}: account ${u.user_id} (${u.username}) is Active; linked employee ${e.id} terminated on ${e.termination_date}; last login ${u.last_login}.`,
          amount_at_risk: 0, txn_date: u.snapshot_date, evidence: { user_access: [u] }, related: [{ type: "employee", id: e.id, why: "HR leaver record" }],
        });
      }
      return { population: R.user_access.length, candidates: out };
    },
  },
  "GL-01": {
    version: "v1",
    fn: (R) => {
      const out: Candidate[] = [];
      for (const j of R.journal) {
        const self = j.approved_by && j.posted_by === j.approved_by;
        const noAppr = !j.approved_by && j.amount > JE_APPROVAL_THRESHOLD;
        if (!self && !noAppr) continue;
        out.push({
          control_id: "GL-01", record_ids: [j.id], primary_record_id: j.id,
          title: `${self ? "Self-approved" : "Unapproved"} journal: PKR ${fmt(j.amount)}`,
          rule_detail: `${j.id}: PKR ${fmt(j.amount)} to GL ${j.gl_account} on ${j.posting_date}, posted by ${j.posted_by}, approved by ${j.approved_by ?? "nobody"}; source ${j.source}.`,
          amount_at_risk: j.amount, txn_date: j.posting_date, evidence: { journal: [j] }, related: [],
        });
      }
      return { population: R.journal.length, candidates: out };
    },
  },
};

for (const [k, v] of Object.entries(TESTS)) RULE_VERSIONS[k] = v.version;

export function runAllTests(R: Records, m: Master): TestResult[] {
  return Object.entries(TESTS).map(([id, t]) => ({ control_id: id, rule_version: t.version, ...t.fn(R, m) }));
}
