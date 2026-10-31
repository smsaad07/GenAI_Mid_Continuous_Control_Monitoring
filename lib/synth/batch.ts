// Synthetic SAP-style extract generator. generateBatch(n) is a pure function of n:
// the same batch number always produces the same records and the same seeded
// breaches, which is what makes the evaluation reproducible.
import { Rng, pad, addDays } from "../rng";
import { Master, Vendor, Employee, ErpUser, PLANTS } from "./master";
import {
  APPROVAL_LIMIT_PO, MIN_WAGE, Severity, amountSeverity, WRITE_OFF_THRESHOLD,
} from "../controls/catalog";

export type Rec = Record<string, any> & { id: string };

export interface GroundTruth {
  control_id: string;
  kind: "breach" | "decoy";
  record_ids: string[];
  expected_severity: Severity | null;
  amount_at_risk: number;
  scenario: string;
}

export interface Batch {
  batch_no: number;
  window_start: string;
  window_end: string;
  records: Record<string, Rec[]>; // keyed by record type
  truth: GroundTruth[];
}

export const BATCH_EPOCH = "2026-07-06";
export const RECORD_TYPES = [
  "purchase_order", "goods_receipt", "invoice", "payment", "bank_change", "sales_order",
  "write_off", "freight_bill", "payslip", "attendance", "user_access", "journal",
] as const;
export const SOURCE_SYSTEM: Record<string, string> = {
  purchase_order: "SAP MM", goods_receipt: "SAP MM", invoice: "SAP FI-AP", payment: "SAP FI (payment run)",
  bank_change: "SAP MM (vendor master log)", sales_order: "SAP SD", write_off: "SAP MM-IM",
  freight_bill: "Transport mgmt system", payslip: "HR/Payroll + IR audit app", attendance: "Biometric T&A",
  user_access: "SAP user roles (GRC)", journal: "SAP FI-GL",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (iso: string, offset = 0) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + offset);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const bump = (s: Severity): Severity => (s === "Low" ? "Medium" : "High");

export interface GenOptions {
  breachWeights?: number[];
  decoyWeights?: number[];
}

export function generateBatch(n: number, m: Master, opts: GenOptions = {}): Batch {
  const r = new Rng(`ccm-batch-${n}`);
  const start = addDays(BATCH_EPOCH, 7 * (n - 1));
  const end = addDays(start, 6);
  const day = (lo = 0, hi = 6) => addDays(start, r.int(lo, hi));
  const seq: Record<string, number> = {};
  const nid = (prefix: string) => `${prefix}-${pad(n, 3)}-${pad((seq[prefix] = (seq[prefix] || 0) + 1), 4)}`;
  const R: Record<string, Rec[]> = Object.fromEntries(RECORD_TYPES.map((t) => [t, []]));
  const truth: GroundTruth[] = [];
  const usedInvoiceRefs = new Set<string>();
  const usedPairs = new Set<string>(); // requester|vendor for POs
  const usedEmployees = new Set<string>();
  const usedVendors = new Set<string>();

  const activeUsers = m.users.filter((u) => u.status === "Active");
  const usersWith = (role: string) => activeUsers.filter((u) => u.roles.includes(role));
  const requesters = usersWith("PO_CREATE");
  const poApprovers = usersWith("PO_APPROVE");
  const goodsVendors = m.vendors.filter((v) => v.kind === "goods");
  const transporters = m.vendors.filter((v) => v.kind === "transport");
  const serviceVendors = m.vendors.filter((v) => v.kind === "service");
  const empById = Object.fromEntries(m.employees.map((e) => [e.id, e]));
  const uname = (u: ErpUser) => `${u.username} (${empById[u.employee_id]?.name})`;
  const contractFor = (vid: string, mid: string) => m.contracts.find((c) => c.vendor_id === vid && c.material_id === mid)!;
  const plantManagers = PLANTS.map((p, i) => ({ plant: p.code, id: m.employees.filter((e) => e.plant === p.code && e.department === "Production" && e.status === "Active")[i]?.id }));

  const invRef = (v: Vendor) => {
    let ref = "";
    const pre = ["INV", "SI", "BL", "TI"][parseInt(v.id.slice(2)) % 4];
    do ref = `${pre}-${r.int(10000, 99999)}`; while (usedInvoiceRefs.has(ref));
    usedInvoiceRefs.add(ref);
    return ref;
  };
  const freshPair = (vendors: Vendor[]) => {
    for (let i = 0; i < 200; i++) {
      const v = r.pick(vendors), u = r.pick(requesters);
      const k = `${u.id}|${v.id}`;
      if (!usedPairs.has(k)) { usedPairs.add(k); return { v, u }; }
    }
    throw new Error("no free requester/vendor pair");
  };

  // --- helpers that build document chains -------------------------------------------------
  function makePO(v: Vendor, u: ErpUser, matId: string, value: number, date: string, priceFactor = r.float(0.97, 1.0), extra: Record<string, any> = {}) {
    const ct = contractFor(v.id, matId);
    const mat = m.materials.find((x) => x.id === matId)!;
    const price = Math.round(ct.price * priceFactor);
    const qty = Math.max(1, Math.round(value / price));
    const val = qty * price;
    const plant = extra.plant || r.pick(PLANTS).code;
    const po: Rec = {
      id: nid("PO"), po_date: date, vendor_id: v.id, vendor_name: v.name, material_id: matId, material_name: mat.name,
      plant, requester_id: u.id, requester: uname(u), quantity: qty, unit: mat.unit, unit_price: price,
      contract_id: ct.id, contract_price: ct.price, po_value: val,
      approval_level: val >= APPROVAL_LIMIT_PO ? "Procurement Manager" : "Procurement Officer",
      approved_by: uname(r.pick(poApprovers)), pr_ref: nid("PR"), notes: null, ...extra,
    };
    delete po.plantOverride;
    R.purchase_order.push(po);
    return po;
  }
  function makeGRN(po: Rec, qty = po.quantity, date = addDays(po.po_date, r.int(0, 2))) {
    const g: Rec = { id: nid("GRN"), po_id: po.id, grn_date: date > end ? end : date, plant: po.plant, material_id: po.material_id, quantity_received: qty, received_by: uname(r.pick(usersWith("GRN_POST").length ? usersWith("GRN_POST") : activeUsers)) };
    R.goods_receipt.push(g);
    return g;
  }
  function makeInvoice(v: Vendor, fields: Record<string, any>) {
    const inv: Rec = {
      id: nid("APV"), vendor_id: v.id, vendor_name: v.name, vendor_invoice_ref: invRef(v),
      invoice_date: fields.invoice_date, posting_date: fields.invoice_date, po_id: null, grn_ids: [],
      quantity: null, unit_price: null, gross_amount: 0, sales_tax: 0, narration: "", service_period: null,
      payment_status: "Open", payment_id: null, posted_by: uname(r.pick(usersWith("AP_INVOICE"))), ...fields,
    };
    inv.sales_tax = Math.round(inv.gross_amount * 0.18 / 1.18);
    R.invoice.push(inv);
    return inv;
  }
  function pay(inv: Rec, v: Vendor, date: string, iban = v.iban) {
    const p: Rec = { id: nid("PMT"), payment_date: date > end ? end : date, vendor_id: v.id, vendor_name: v.name, amount: inv.gross_amount, invoice_ids: [inv.id], paid_to_iban: iban, payment_run_by: uname(r.pick(usersWith("PAYMENT_RUN"))) };
    inv.payment_status = "Paid";
    inv.payment_id = p.id;
    R.payment.push(p);
    return p;
  }
  function goodsChain(v: Vendor, u: ErpUser, value: number, date: string, opts: { paid?: boolean; grnFactor?: number } = {}) {
    const po = makePO(v, u, r.pick(v.materials), value, date);
    const grnQty = Math.round(po.quantity * (opts.grnFactor ?? 1));
    const g = makeGRN(po, grnQty);
    const invDate = addDays(g.grn_date, r.int(0, 2));
    const inv = makeInvoice(v, {
      invoice_date: invDate > end ? end : invDate, po_id: po.id, grn_ids: [g.id], quantity: po.quantity, unit_price: po.unit_price,
      gross_amount: po.quantity * po.unit_price, narration: `${po.material_name} - ${po.quantity} ${po.unit} - ${po.id}`,
    });
    let p: Rec | null = null;
    if (opts.paid ?? r.chance(0.7)) p = pay(inv, v, addDays(inv.invoice_date, r.int(0, 3)));
    return { po, g, inv, p };
  }

  // --- base population (clean transactions) ------------------------------------------------
  for (let i = 0; i < 42; i++) {
    const { v, u } = freshPair(goodsVendors);
    const big = r.chance(0.15);
    const value = big ? r.int(55, 260) * 10_000 + r.int(0, 9999) : r.int(4, 46) * 10_000 + r.int(0, 9999);
    const po = makePO(v, u, r.pick(v.materials), value, day(0, 4));
    if (r.chance(0.9)) {
      const g = makeGRN(po);
      const invDate = addDays(g.grn_date, r.int(0, 2));
      const inv = makeInvoice(v, {
        invoice_date: invDate > end ? end : invDate, po_id: po.id, grn_ids: [g.id], quantity: po.quantity, unit_price: po.unit_price,
        gross_amount: po.quantity * po.unit_price, narration: `${po.material_name} - ${po.quantity} ${po.unit} - ${po.id}`,
      });
      if (r.chance(0.7)) pay(inv, v, addDays(inv.invoice_date, r.int(0, 3)));
    }
  }
  // recurring monthly service invoices for a rotating quarter of service vendors
  const billingThisWeek = serviceVendors.filter((_, i) => i % 4 === n % 4);
  for (const v of billingThisWeek) {
    usedVendors.add(v.id);
    const plant = r.pick(PLANTS);
    const inv = makeInvoice(v, {
      invoice_date: day(0, 3), gross_amount: v.monthly_fee!, service_period: monthLabel(start),
      narration: `${v.category} services - ${plant.name} - ${monthLabel(start)}`,
    });
    if (r.chance(0.8)) pay(inv, v, addDays(inv.invoice_date, r.int(1, 3)));
  }
  // sales orders
  const sdUsers = usersWith("SD_ORDER").length ? usersWith("SD_ORDER") : activeUsers;
  for (let i = 0; i < 55; i++) {
    const c = r.pick(m.customers), p = r.pick(m.products);
    const disc = r.int(0, 8) / 100;
    const net = Math.round(p.list * (1 - disc));
    const outstanding = Math.round(c.credit_limit * r.float(0.1, 0.6));
    const maxQty = Math.floor((c.credit_limit - outstanding) / net);
    const qty = Math.max(20, Math.min(r.int(50, 600), maxQty));
    R.sales_order.push({
      id: nid("SO"), so_date: day(), customer_id: c.id, customer_name: c.name, sku: p.sku, product_name: p.name,
      quantity_cartons: qty, list_price: p.list, net_price: net, discount_pct: Math.round(disc * 1000) / 10,
      order_value: qty * net, outstanding_before: outstanding, credit_limit: c.credit_limit, status: "Released",
      released_by: uname(r.pick(sdUsers)), release_note: null, scheme_ref: null,
    });
  }
  // stock write-offs
  const whUsers = usersWith("INV_WRITEOFF").length ? usersWith("INV_WRITEOFF") : activeUsers;
  for (let i = 0; i < 10; i++) {
    const plant = r.pick(PLANTS).code;
    const big = r.chance(0.3);
    const val = big ? r.int(110, 450) * 1000 : r.int(5, 95) * 1000;
    const pm = plantManagers.find((x) => x.plant === plant)!.id;
    R.write_off.push({
      id: nid("WO"), date: day(), plant, item: r.pick(m.products).name, quantity: r.int(5, 120), value: val,
      reason: r.pick(["Damaged in handling", "Packaging defect", "Quality hold - failed moisture test", "Near expiry"]),
      requested_by: uname(r.pick(whUsers)), approved_by: big ? `${empById[pm].name} (${pm})` : uname(r.pick(whUsers)),
      approver_role: big ? "Plant Manager" : "Warehouse Supervisor", reference: null,
    });
  }
  // freight bills
  for (let i = 0; i < 35; i++) {
    const rt = r.pick(m.routes), t = r.pick(transporters);
    const km = Math.round(rt.km * r.float(1.0, 1.1));
    R.freight_bill.push({
      id: nid("TRP"), trip_date: day(), transporter_id: t.id, transporter_name: t.name, vehicle_no: `${r.pick(["TLA", "TKA", "JW", "LES", "KPA"])}-${r.int(100, 999)}`,
      route_id: rt.id, origin: rt.origin, destination: rt.destination, standard_km: rt.km, billed_km: km, rate_per_km: rt.rate_per_km,
      billed_amount: km * rt.rate_per_km, pod_ref: `POD-${pad(n, 3)}-${pad(i + 1, 4)}`, diversion_note: null,
    });
  }
  // payroll (one payroll group per batch) - excludes part-time staff (they appear only in seeded cases)
  const payGroup = m.employees.filter((e, i) => e.status === "Active" && e.contracted_hours_per_week === 48 && i % 4 === n % 4);
  for (const e of payGroup) {
    R.payslip.push({
      id: nid("PSL"), pay_date: end, period: monthLabel(start), employee_id: e.id, employee_name: e.name, cnic: e.cnic, eobi_no: e.eobi_no,
      plant: e.plant, province: e.province, employment_type: e.employment_type, contractor_id: e.contractor_id,
      contracted_hours_per_week: e.contracted_hours_per_week, gross_pay: e.monthly_wage, pay_type: "Regular salary", bank_account: e.bank_account,
      source: e.employment_type === "Contract worker" ? "Service-provider wage sheet (IR audit app)" : "SAP HR payroll",
    });
    usedEmployees.add(e.id);
  }
  // attendance (weekly hours)
  const floor = m.employees.filter((e) => e.status === "Active" && ["Production", "Packing", "Warehouse"].includes(e.department));
  for (const e of r.sample(floor, 90)) {
    const hrs = Math.round(r.float(40, 58) * 2) / 2;
    R.attendance.push({ id: nid("ATT"), week_start: start, employee_id: e.id, employee_name: e.name, plant: e.plant, total_hours: hrs, overtime_hours: Math.max(0, hrs - 48), device_id: `${e.plant}-0${r.int(1, 4)}`, punch_anomaly: null });
  }
  // user access snapshot
  const snapshotUsers = r.sample(activeUsers.filter((u) => empById[u.employee_id].status === "Active"), 25);
  for (const u of snapshotUsers) {
    R.user_access.push({ id: nid("UAR"), snapshot_date: end, user_id: u.id, username: u.username, employee_id: u.employee_id, employee_name: empById[u.employee_id].name, department: u.department, roles: u.roles, account_status: "Active", last_login: day(), mitigation: null });
  }
  // journals
  const glPost = usersWith("GL_POST"), glApp = usersWith("GL_APPROVE");
  for (let i = 0; i < 32; i++) {
    const poster = r.pick(glPost);
    let appr = r.pick(glApp);
    if (appr.id === poster.id) appr = glApp.find((x) => x.id !== poster.id) || appr;
    R.journal.push({
      id: nid("JE"), posting_date: day(), source: "Manual", description: r.pick(["Accrual for utilities", "Reclass of freight cost", "Provision for slow-moving stock", "Prepaid insurance amortisation", "Accrued audit fee", "Reclass between cost centres"]),
      gl_account: r.pick(["510100", "520300", "130500", "211000", "610200"]), amount: r.int(5, 450) * 10_000, posted_by: uname(poster), approved_by: uname(appr),
    });
  }
  for (let i = 0; i < 6; i++) {
    R.journal.push({ id: nid("JE"), posting_date: day(), source: "Recurring batch ZFI_ACCR", description: "Monthly recurring accrual", gl_account: "211000", amount: r.int(5, 90) * 10_000, posted_by: "BATCH_JOB", approved_by: null });
  }

  // --- seeded breaches & decoys -------------------------------------------------------------
  const bw = opts.breachWeights ?? [0, 0, 0, 1, 1, 2];
  const dw = opts.decoyWeights ?? [0, 0, 1];
  const nB = () => r.pick(bw);
  const nD = () => r.pick(dw);
  const gt = (control_id: string, kind: "breach" | "decoy", record_ids: string[], amount: number, sev: Severity | null, scenario: string) =>
    truth.push({ control_id, kind, record_ids, amount_at_risk: Math.round(amount), expected_severity: kind === "breach" ? sev : null, scenario });
  const spreadValue = () => r.pick([r.int(6, 18) * 10_000, r.int(25, 90) * 10_000, r.int(105, 260) * 10_000]) + r.int(0, 9999);

  // P2P-01 duplicate invoices
  for (let i = 0; i < nB(); i++) {
    const { v, u } = freshPair(goodsVendors);
    const { inv } = goodsChain(v, u, spreadValue(), day(0, 2), { paid: true });
    const variant = r.pick(["exact", "format", "typo"] as const);
    const base = inv.vendor_invoice_ref as string;
    const ref = variant === "exact" ? base : variant === "format" ? base.replace("-", "/").toLowerCase() : base.slice(0, -2) + base.slice(-1) + base.slice(-2, -1);
    const dup = makeInvoice(v, { ...inv, id: undefined, invoice_date: addDays(inv.invoice_date, r.int(1, 3)), posted_by: uname(r.pick(usersWith("AP_INVOICE"))) });
    dup.id = nid("APV");
    usedInvoiceRefs.add(ref);
    dup.vendor_invoice_ref = ref;
    dup.posting_date = dup.invoice_date;
    pay(dup, v, addDays(dup.invoice_date, 1));
    gt("P2P-01", "breach", [inv.id, dup.id], dup.gross_amount, amountSeverity(dup.gross_amount), `Invoice ${base} booked twice (${variant} reference variant)`);
  }
  for (let i = 0; i < nD(); i++) {
    const v = r.pick(serviceVendors.filter((x) => !usedVendors.has(x.id)));
    if (!v) break;
    usedVendors.add(v.id);
    const plant = r.pick(PLANTS);
    const a = makeInvoice(v, { invoice_date: day(0, 2), gross_amount: v.monthly_fee!, service_period: monthLabel(start, -1), narration: `${v.category} services - ${plant.name} - ${monthLabel(start, -1)} (late billing)` });
    const b = makeInvoice(v, { invoice_date: addDays(a.invoice_date, r.int(1, 3)), gross_amount: v.monthly_fee!, service_period: monthLabel(start), narration: `${v.category} services - ${plant.name} - ${monthLabel(start)}` });
    pay(a, v, addDays(a.invoice_date, 1));
    pay(b, v, addDays(b.invoice_date, 1));
    gt("P2P-01", "decoy", [a.id, b.id], 0, null, "Recurring monthly fee for two different service periods");
  }

  // P2P-02 split POs
  for (let i = 0; i < nB(); i++) {
    const { v, u } = freshPair(goodsVendors);
    const mat = r.pick(v.materials);
    const k = r.chance(0.6) ? 2 : 3;
    const d0 = r.int(0, 3);
    const plant = r.pick(PLANTS).code;
    const pos = Array.from({ length: k }, (_, j) => makePO(v, u, mat, r.int(30, 48) * 10_000 + r.int(0, 9999), addDays(start, d0 + j), r.float(0.97, 1.0), { plant, notes: j === 0 ? "Urgent requirement" : "Balance quantity of same requirement" }));
    const total = pos.reduce((s, p) => s + p.po_value, 0);
    gt("P2P-02", "breach", pos.map((p) => p.id), total, amountSeverity(total), `${k} POs for the same material split under the approval limit`);
  }
  for (let i = 0; i < nD(); i++) {
    const { v, u } = freshPair(goodsVendors.filter((x) => x.materials.length >= 2));
    const [m1, m2] = r.sample(v.materials, 2);
    const [p1, p2] = r.sample(PLANTS.slice(), 2);
    const a = makePO(v, u, m1, r.int(30, 46) * 10_000, day(0, 2), r.float(0.97, 1), { plant: p1.code, notes: `Monthly requirement for ${p1.name}` });
    const b = makePO(v, u, m2, r.int(30, 46) * 10_000, addDays(a.po_date, r.int(1, 3)), r.float(0.97, 1), { plant: p2.code, notes: `Monthly requirement for ${p2.name}` });
    gt("P2P-02", "decoy", [a.id, b.id], 0, null, "Separate requirements: different plants, materials and requisitions");
  }

  // P2P-03 price above contract
  for (let i = 0; i < nB(); i++) {
    const { v, u } = freshPair(goodsVendors);
    const factor = r.float(1.05, 1.3);
    const po = makePO(v, u, r.pick(v.materials), r.pick([r.int(20, 45) * 10_000, r.int(150, 400) * 10_000, r.int(600, 1200) * 10_000]), day(), factor);
    const excess = (po.unit_price - po.contract_price) * po.quantity;
    gt("P2P-03", "breach", [po.id], excess, amountSeverity(excess), `PO priced ${Math.round((factor - 1) * 100)}% above contract`);
  }
  for (let i = 0; i < nD(); i++) {
    const { v, u } = freshPair(goodsVendors);
    const memo = `PV-2026-${pad(r.int(10, 99), 3)}`;
    const po = makePO(v, u, r.pick(v.materials), r.int(20, 300) * 10_000, day(), r.float(1.05, 1.15), { price_variance_memo: memo, notes: `Price variance approved by Head of Procurement - memo ${memo} (supplier cost increase after duty revision)` });
    gt("P2P-03", "decoy", [po.id], 0, null, "Approved price-variance memo");
  }

  // P2P-04 three-way match
  for (let i = 0; i < nB(); i++) {
    const { v, u } = freshPair(goodsVendors);
    const { inv, g, po } = goodsChain(v, u, spreadValue() * 3, day(0, 3), { paid: true, grnFactor: r.float(0.7, 0.92) });
    const excess = (inv.quantity - g.quantity_received) * po.unit_price;
    gt("P2P-04", "breach", [inv.id, po.id, g.id], excess, amountSeverity(excess), "Invoice paid for more than goods received");
  }
  for (let i = 0; i < nD(); i++) {
    const { v, u } = freshPair(goodsVendors);
    const { inv, g, po } = goodsChain(v, u, spreadValue() * 2, day(0, 3), { paid: false, grnFactor: r.float(0.7, 0.92) });
    inv.payment_status = "Blocked";
    inv.block_reason = "R - quantity variance: blocked by invoice verification tolerance check";
    gt("P2P-04", "decoy", [inv.id, po.id, g.id], 0, null, "Variance blocked by ERP; not paid");
  }

  // P2P-05 bank change before payment
  const bankCase = (kind: "breach" | "decoy") => {
    const { v, u } = freshPair(goodsVendors.filter((x) => !usedVendors.has(x.id)));
    usedVendors.add(v.id);
    const d = day(0, 2);
    const newIban = `PK${r.digits(2)}${r.pick(["SCBL", "JSBL", "SUMB"])}${r.digits(16)}`;
    const bc: Rec = {
      id: nid("BCR"), vendor_id: v.id, vendor_name: v.name, change_date: d, old_iban: v.iban, new_iban: newIban,
      requested_via: kind === "breach" ? "Email" : "Letter on vendor letterhead",
      requester_contact: kind === "breach" ? `accounts.${v.name.split(" ")[0].toLowerCase()}@${r.pick(["gmail.com", "outlook.com"])} (not the registered contact)` : "Registered contact",
      verification: kind === "breach" ? null : `Call-back to registered contact by Treasury on ${d}; signed confirmation filed`,
      changed_by: uname(r.pick(usersWith("VENDOR_MASTER"))),
    };
    R.bank_change.push(bc);
    const { inv } = goodsChain(v, u, spreadValue(), d, { paid: false });
    const p = pay(inv, v, addDays(d, r.int(2, 5)), newIban);
    gt("P2P-05", kind, [bc.id, p.id], kind === "breach" ? p.amount : 0, kind === "breach" ? "High" : null, kind === "breach" ? "Unverified email request changed bank account; payment followed" : "Bank change verified by call-back");
  };
  for (let i = 0; i < nB(); i++) bankCase("breach");
  for (let i = 0; i < nD(); i++) bankCase("decoy");

  // O2C-01 credit limit override
  const creditCase = (kind: "breach" | "decoy") => {
    const c = r.pick(m.customers), p = r.pick(m.products);
    const outstanding = Math.round(c.credit_limit * r.float(0.82, 0.97));
    const excessTarget = r.pick([r.int(5, 18) * 10_000, r.int(25, 80) * 10_000, r.int(110, 220) * 10_000]);
    const qty = Math.ceil((c.credit_limit - outstanding + excessTarget) / p.list);
    const value = qty * p.list;
    const so: Rec = {
      id: nid("SO"), so_date: day(), customer_id: c.id, customer_name: c.name, sku: p.sku, product_name: p.name, quantity_cartons: qty,
      list_price: p.list, net_price: p.list, discount_pct: 0, order_value: value, outstanding_before: outstanding, credit_limit: c.credit_limit,
      status: "Released", released_by: uname(r.pick(sdUsers)), scheme_ref: null,
      release_note: kind === "decoy" ? `Temporary credit extension approved by CFO, ref CE-2026-${pad(r.int(10, 99), 3)}, valid to ${end}` : null,
    };
    R.sales_order.push(so);
    const excess = outstanding + value - c.credit_limit;
    gt("O2C-01", kind, [so.id], kind === "breach" ? excess : 0, kind === "breach" ? amountSeverity(excess) : null, kind === "breach" ? "Order released above credit limit without approval" : "CFO-approved temporary credit extension");
  };
  for (let i = 0; i < nB(); i++) creditCase("breach");
  for (let i = 0; i < nD(); i++) creditCase("decoy");

  // O2C-02 unauthorised discount
  const discountCase = (kind: "breach" | "decoy") => {
    const c = r.pick(m.customers), p = r.pick(m.products);
    const disc = kind === "breach" ? r.int(14, 30) / 100 : 0.15;
    const net = Math.round(p.list * (1 - disc));
    const qty = r.pick([r.int(80, 300), r.int(400, 1500), r.int(2500, 4000)]);
    const so: Rec = {
      id: nid("SO"), so_date: day(), customer_id: c.id, customer_name: c.name, sku: p.sku, product_name: p.name, quantity_cartons: qty,
      list_price: p.list, net_price: net, discount_pct: Math.round(disc * 1000) / 10, order_value: qty * net,
      outstanding_before: Math.round(c.credit_limit * 0.1), credit_limit: Math.max(c.credit_limit, Math.round(c.credit_limit * 0.1) + qty * net + 100000),
      status: "Released", released_by: uname(r.pick(sdUsers)), release_note: null,
      scheme_ref: kind === "decoy" ? `TP-2026-Q3-${pad(r.int(1, 12), 2)}` : null,
      scheme_note: kind === "decoy" ? `Trade promotion 15% on ${p.sku}, approved by Head of Sales and Finance, valid ${start} to ${end}` : null,
    };
    R.sales_order.push(so);
    const excess = (disc - 0.1) * p.list * qty;
    gt("O2C-02", kind, [so.id], kind === "breach" ? excess : 0, kind === "breach" ? amountSeverity(excess) : null, kind === "breach" ? `${Math.round(disc * 100)}% discount without scheme` : "Approved trade promotion");
  };
  for (let i = 0; i < nB(); i++) discountCase("breach");
  for (let i = 0; i < nD(); i++) discountCase("decoy");

  // INV-01 write-offs
  for (let i = 0; i < nB(); i++) {
    const plant = r.pick(PLANTS).code;
    const req = r.pick(whUsers);
    const self = r.chance(0.5);
    const val = r.pick([r.int(110, 190) * 1000, r.int(220, 900) * 1000, r.int(1050, 1800) * 1000]);
    const wo: Rec = {
      id: nid("WO"), date: day(), plant, item: r.pick(m.products).name, quantity: r.int(50, 900), value: val,
      reason: r.pick(["Damaged in storage", "Stock count shortage adjusted", "Pest infestation"]), requested_by: uname(req),
      approved_by: self ? uname(req) : uname(r.pick(whUsers.filter((x) => x.id !== req.id)) || req), approver_role: "Warehouse Supervisor", reference: null,
    };
    R.write_off.push(wo);
    const sev = self ? bump(amountSeverity(val)) : amountSeverity(val);
    gt("INV-01", "breach", [wo.id], val, sev, self ? "Write-off self-approved by requester" : "Write-off above threshold approved below Plant Manager level");
  }
  for (let i = 0; i < nD(); i++) {
    const wo: Rec = {
      id: nid("WO"), date: day(), plant: r.pick(PLANTS).code, item: r.pick(m.products.filter((p) => /cake/i.test(p.name))).name, quantity: r.int(100, 600),
      value: r.int(120, 600) * 1000, reason: "Near-expiry cakes destroyed", requested_by: uname(r.pick(whUsers)), approved_by: "QA-STANDING-APPROVAL",
      approver_role: "QA standing approval", reference: `SA-QA-2026-03; destruction certificate DC-${pad(n, 3)}-${r.int(100, 999)} witnessed by QA and Finance`,
    };
    R.write_off.push(wo);
    gt("INV-01", "decoy", [wo.id], 0, null, "Destruction under QA standing approval with certificate");
  }

  // LOG-01 freight over-billing
  for (let i = 0; i < nB(); i++) {
    const rt = r.pick(m.routes.filter((x) => x.km > 150)), t = r.pick(transporters);
    const trips = r.pick([1, 1, 3]);
    const km = Math.round(rt.km * r.float(1.2, 1.6)) * trips;
    const fb: Rec = {
      id: nid("TRP"), trip_date: day(), transporter_id: t.id, transporter_name: t.name, vehicle_no: `${r.pick(["TLA", "TKA", "JW"])}-${r.int(100, 999)}`,
      route_id: rt.id, origin: rt.origin, destination: rt.destination, standard_km: rt.km * trips, billed_km: km, rate_per_km: rt.rate_per_km,
      billed_amount: km * rt.rate_per_km, pod_ref: `POD-${pad(n, 3)}-9${pad(i, 3)}`, diversion_note: null, trips_in_bill: trips,
    };
    R.freight_bill.push(fb);
    const excess = (km - rt.km * trips) * rt.rate_per_km;
    gt("LOG-01", "breach", [fb.id], excess, amountSeverity(excess), "Billed km above standard route without diversion");
  }
  for (let i = 0; i < nD(); i++) {
    const rt = r.pick(m.routes.filter((x) => x.km > 150)), t = r.pick(transporters);
    const km = Math.round(rt.km * r.float(1.2, 1.35));
    R.freight_bill.push({
      id: nid("TRP"), trip_date: day(), transporter_id: t.id, transporter_name: t.name, vehicle_no: `KPA-${r.int(100, 999)}`, route_id: rt.id, origin: rt.origin, destination: rt.destination,
      standard_km: rt.km, billed_km: km, rate_per_km: rt.rate_per_km, billed_amount: km * rt.rate_per_km, pod_ref: `POD-${pad(n, 3)}-8${pad(i, 3)}`,
      diversion_note: `Diverted due to motorway closure (NHA advisory); diversion approved by logistics desk on ${day()}`,
    });
    gt("LOG-01", "decoy", [R.freight_bill[R.freight_bill.length - 1].id], 0, null, "Approved route diversion");
  }

  // PAY-01 below minimum wage
  const fullTimeContract = m.employees.filter((e) => e.status === "Active" && e.employment_type === "Contract worker" && e.contracted_hours_per_week === 48 && !usedEmployees.has(e.id));
  for (let i = 0; i < nB(); i++) {
    const e = r.pick(fullTimeContract.filter((x) => !usedEmployees.has(x.id)));
    usedEmployees.add(e.id);
    const min = MIN_WAGE[e.province];
    const wage = r.int(28, 38) * 1000 + r.pick([0, 500]);
    const ps: Rec = {
      id: nid("PSL"), pay_date: end, period: monthLabel(start), employee_id: e.id, employee_name: e.name, cnic: e.cnic, eobi_no: e.eobi_no, plant: e.plant, province: e.province,
      employment_type: e.employment_type, contractor_id: e.contractor_id, contracted_hours_per_week: 48, gross_pay: wage, pay_type: "Regular salary", bank_account: e.bank_account,
      source: "Service-provider wage sheet (IR audit app)",
    };
    R.payslip.push(ps);
    const shortfall = (min - wage) / min;
    gt("PAY-01", "breach", [ps.id], min - wage, shortfall > 0.2 ? "High" : "Medium", `Full-time worker paid ${Math.round(shortfall * 100)}% below minimum wage`);
  }
  const partTimers = m.employees.filter((e) => e.status === "Active" && e.contracted_hours_per_week < 48);
  for (let i = 0; i < nD(); i++) {
    const e = r.pick(partTimers.filter((x) => !usedEmployees.has(x.id)));
    if (!e) break;
    usedEmployees.add(e.id);
    const ps: Rec = {
      id: nid("PSL"), pay_date: end, period: monthLabel(start), employee_id: e.id, employee_name: e.name, cnic: e.cnic, eobi_no: e.eobi_no, plant: e.plant, province: e.province,
      employment_type: e.employment_type, contractor_id: e.contractor_id, contracted_hours_per_week: e.contracted_hours_per_week, gross_pay: e.monthly_wage, pay_type: "Regular salary", bank_account: e.bank_account,
      source: "Service-provider wage sheet (IR audit app)",
    };
    R.payslip.push(ps);
    gt("PAY-01", "decoy", [ps.id], 0, null, "Part-time worker paid at or above pro-rata minimum wage");
  }

  // PAY-02 pay to inactive employees
  const leavers = m.employees.filter((e) => e.status === "Terminated" && e.contracted_hours_per_week === 48);
  const leaverCase = (kind: "breach" | "decoy") => {
    const e = r.pick(leavers.filter((x) => !usedEmployees.has(x.id)));
    if (!e) return;
    usedEmployees.add(e.id);
    const amount = kind === "breach" ? e.monthly_wage : Math.round(e.monthly_wage * r.float(1.5, 3.5));
    const ps: Rec = {
      id: nid("PSL"), pay_date: end, period: monthLabel(start), employee_id: e.id, employee_name: e.name, cnic: e.cnic, eobi_no: e.eobi_no, plant: e.plant, province: e.province,
      employment_type: e.employment_type, contractor_id: e.contractor_id, contracted_hours_per_week: e.contracted_hours_per_week, gross_pay: amount,
      pay_type: kind === "breach" ? "Regular salary" : "Final settlement", bank_account: e.bank_account,
      source: e.employment_type === "Contract worker" ? "Service-provider wage sheet (IR audit app)" : "SAP HR payroll",
      remarks: kind === "decoy" ? "Full and final settlement: leave encashment and gratuity" : null,
    };
    R.payslip.push(ps);
    gt("PAY-02", kind, [ps.id], kind === "breach" ? amount : 0, kind === "breach" ? "High" : null, kind === "breach" ? "Regular salary paid after termination" : "Final settlement after termination");
  };
  for (let i = 0; i < nB(); i++) leaverCase("breach");
  for (let i = 0; i < nD(); i++) leaverCase("decoy");

  // PAY-03 excessive hours
  const attIds = new Set(R.attendance.map((a) => a.employee_id));
  const freeFloor = floor.filter((e) => !attIds.has(e.id));
  for (let i = 0; i < nB(); i++) {
    const e = r.pick(freeFloor);
    attIds.add(e.id);
    const hrs = r.pick([r.int(62, 69), r.int(72, 80)]) + 0.5 * r.int(0, 1);
    R.attendance.push({ id: nid("ATT"), week_start: start, employee_id: e.id, employee_name: e.name, plant: e.plant, total_hours: hrs, overtime_hours: hrs - 48, device_id: `${e.plant}-0${r.int(1, 4)}`, punch_anomaly: null });
    gt("PAY-03", "breach", [R.attendance[R.attendance.length - 1].id], 0, hrs > 70 ? "High" : "Medium", `${hrs} hours worked in one week`);
  }
  for (let i = 0; i < nD(); i++) {
    const e = r.pick(freeFloor.filter((x) => !attIds.has(x.id)));
    attIds.add(e.id);
    const hrs = r.int(63, 70);
    const corrected = r.int(48, 56);
    R.attendance.push({
      id: nid("ATT"), week_start: start, employee_id: e.id, employee_name: e.name, plant: e.plant, total_hours: hrs, overtime_hours: hrs - 48, device_id: `${e.plant}-03`,
      punch_anomaly: `Duplicate IN punch merged on ${day()} - device ${e.plant}-03 sync error; corrected hours ${corrected}.0 per timekeeping ticket TK-${r.int(1000, 9999)}`,
    });
    gt("PAY-03", "decoy", [R.attendance[R.attendance.length - 1].id], 0, null, "Biometric device duplicate punch; corrected hours within limit");
  }

  // ITA-01 SoD conflicts
  const sodCase = (kind: "breach" | "decoy") => {
    const u = r.pick(snapshotUsers);
    const rec = R.user_access.find((x) => x.user_id === u.id && !x._used);
    if (!rec) return;
    rec._used = true;
    const pair = r.chance(0.5) ? ["VENDOR_MASTER", "PAYMENT_RUN"] : ["PO_CREATE", "PO_APPROVE"];
    rec.roles = Array.from(new Set([...rec.roles.filter((x: string) => !["VENDOR_MASTER", "PAYMENT_RUN", "PO_CREATE", "PO_APPROVE"].includes(x)), ...pair]));
    if (kind === "decoy") rec.mitigation = `Firefighter ID FF-0${r.int(1, 5)}: time-bound access (72 h) for period-end close, approved by Finance Controller; activity log reviewed (FF-LOG-${pad(n, 3)}-${r.int(10, 99)})`;
    gt("ITA-01", kind, [rec.id], 0, kind === "breach" ? (pair[0] === "VENDOR_MASTER" ? "High" : "Medium") : null, kind === "breach" ? `User holds ${pair.join(" + ")}` : "Approved, reviewed firefighter access");
  };
  for (let i = 0; i < nB(); i++) sodCase("breach");
  for (let i = 0; i < nD(); i++) sodCase("decoy");

  // ITA-02 leavers with active accounts
  const leaverUserPool = m.users.filter((u) => empById[u.employee_id].status === "Terminated");
  const usedLeaverUsers = new Set<string>();
  const leaverAccess = (kind: "breach" | "decoy") => {
    const pool = leaverUserPool.filter((u) => !usedLeaverUsers.has(u.id) && (kind === "decoy" ? empById[u.employee_id].leaver_type === "Inter-company transfer" : empById[u.employee_id].leaver_type !== "Inter-company transfer"));
    if (!pool.length) return;
    const u = r.pick(pool);
    usedLeaverUsers.add(u.id);
    const e = empById[u.employee_id];
    const loggedAfter = kind === "decoy" ? true : r.chance(0.5);
    const last = loggedAfter ? day() : addDays(e.termination_date!, -r.int(3, 20));
    R.user_access.push({ id: nid("UAR"), snapshot_date: end, user_id: u.id, username: u.username, employee_id: e.id, employee_name: e.name, department: u.department, roles: u.roles, account_status: "Active", last_login: last, mitigation: null });
    gt("ITA-02", kind, [R.user_access[R.user_access.length - 1].id], 0, kind === "breach" ? (loggedAfter ? "High" : "Medium") : null, kind === "breach" ? `Leaver account active${loggedAfter ? ", used after termination" : ""}` : "Transferred and re-hired under new ID");
  };
  for (let i = 0; i < nB(); i++) leaverAccess("breach");
  for (let i = 0; i < nD(); i++) leaverAccess("decoy");

  // GL-01 self-approved manual journals
  for (let i = 0; i < nB(); i++) {
    const poster = r.pick(glPost.length ? glPost : activeUsers);
    const noApprover = r.chance(0.3);
    const amount = noApprover ? r.int(105, 480) * 10_000 : r.pick([r.int(5, 18) * 10_000, r.int(25, 95) * 10_000, r.int(110, 480) * 10_000]);
    R.journal.push({ id: nid("JE"), posting_date: day(), source: "Manual", description: r.pick(["Reversal of accrued rebate", "Reclass to prepaid expenses", "Write-back of provision", "Adjustment to sales returns"]), gl_account: r.pick(["410100", "130500", "211000"]), amount, posted_by: uname(poster), approved_by: noApprover ? null : uname(poster) });
    gt("GL-01", "breach", [R.journal[R.journal.length - 1].id], amount, amountSeverity(amount), noApprover ? "Manual journal above PKR 1m with no approver" : "Manual journal self-approved");
  }
  for (let i = 0; i < nD(); i++) {
    R.journal.push({ id: nid("JE"), posting_date: day(), source: "Recurring batch ZFI_DEPR", description: "Monthly depreciation run (system batch job)", gl_account: "620100", amount: r.int(110, 400) * 10_000, posted_by: "BATCH_JOB", approved_by: null });
    gt("GL-01", "decoy", [R.journal[R.journal.length - 1].id], 0, null, "System recurring batch entry");
  }

  // verified bank changes for vendors not paid this batch (generated last so no later payment hits them)
  const paidVendors = new Set(R.payment.map((p) => p.vendor_id));
  for (const v of r.sample(m.vendors.filter((x) => !paidVendors.has(x.id)), 2)) {
    usedVendors.add(v.id);
    const d = day();
    R.bank_change.push({
      id: nid("BCR"), vendor_id: v.id, vendor_name: v.name, change_date: d, old_iban: v.iban, new_iban: `PK${r.digits(2)}MEZN${r.digits(16)}`,
      requested_via: "Vendor portal", requester_contact: "Registered contact", verification: `Call-back to registered contact by Treasury on ${d}`, changed_by: uname(r.pick(usersWith("VENDOR_MASTER"))),
    });
  }
  for (const t of RECORD_TYPES) for (const x of R[t]) delete x._used;
  return { batch_no: n, window_start: start, window_end: end, records: R, truth };
}
