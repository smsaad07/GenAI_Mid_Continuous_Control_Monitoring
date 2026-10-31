// Risk & Control Matrix (RCM) for the continuous control monitoring tool.
// Each control has a deterministic rule test (lib/controls/tests.ts) and a
// severity rubric that the investigation agent must apply.

export type Severity = "High" | "Medium" | "Low";

export interface ControlDef {
  id: string;
  process: string;
  processCode: "P2P" | "O2C" | "INV" | "LOG" | "PAY" | "ITA" | "GL";
  name: string;
  risk: string;
  controlStatement: string;
  ruleDescription: string;
  sourceSystems: string[];
  owner: string; // process owner who remediates
  frequency: string;
  regulation: string;
  severityRubric: string;
  // Clues that legitimately explain a rule hit (told to the agent as policy, not as answers)
  legitimateExplanations: string;
}

export const APPROVAL_LIMIT_PO = 500_000; // PKR, Procurement Officer PO approval limit
export const PRICE_TOLERANCE = 0.02; // 2% above contract price
export const WRITE_OFF_THRESHOLD = 100_000; // PKR
export const DISCOUNT_LIMIT = 0.1; // 10% below list price
export const FREIGHT_KM_TOLERANCE = 0.15; // 15% above standard route km
export const WEEKLY_HOURS_LIMIT = 60; // normal 48 h + 12 h overtime (company policy cap)
export const JE_APPROVAL_THRESHOLD = 1_000_000; // PKR
export const BANK_CHANGE_WINDOW_DAYS = 14;
export const DUPLICATE_WINDOW_DAYS = 45;

// Provincial minimum wage parameters (monthly, PKR). Parameter table: verify
// against the current notification of each provincial wage board before use.
export const MIN_WAGE: Record<string, number> = {
  Sindh: 40_000,
  "Khyber Pakhtunkhwa": 40_000,
  Punjab: 40_000,
};

const AMOUNT_RUBRIC =
  "High if amount at risk >= PKR 1,000,000; Medium if PKR 200,000 to 999,999; Low if below PKR 200,000.";

export const CONTROLS: ControlDef[] = [
  {
    id: "P2P-01",
    process: "Procure-to-Pay",
    processCode: "P2P",
    name: "Duplicate vendor invoices",
    risk: "The same vendor invoice is booked and paid twice.",
    controlStatement: "AP posts each vendor invoice once; the ERP blocks duplicate invoice references.",
    ruleDescription: `Same vendor and same gross amount on two invoices dated within ${DUPLICATE_WINDOW_DAYS} days, or the same normalised invoice reference.`,
    sourceSystems: ["SAP FI-AP (invoices)", "SAP MM (vendor master)"],
    owner: "Head of Finance Operations (AP)",
    frequency: "Every ingestion cycle",
    regulation: "Companies Act 2017 s.220 (books of account); Sales Tax Act 1990 (input tax records)",
    severityRubric: AMOUNT_RUBRIC + " Amount at risk is the value of the duplicate (second) invoice.",
    legitimateExplanations:
      "Recurring fixed-fee services (rent, security, canteen) bill the same amount every month; invoices covering DIFFERENT service periods are not duplicates.",
  },
  {
    id: "P2P-02",
    process: "Procure-to-Pay",
    processCode: "P2P",
    name: "Split purchase orders",
    risk: "Requirements are split into several POs to stay under the approval limit.",
    controlStatement: `POs above PKR ${APPROVAL_LIMIT_PO.toLocaleString("en-US")} require Procurement Manager approval.`,
    ruleDescription: `Two or more POs by the same requester to the same vendor within 7 days, each below PKR ${APPROVAL_LIMIT_PO.toLocaleString("en-US")}, whose total exceeds it.`,
    sourceSystems: ["SAP MM (purchase orders, requisitions)"],
    owner: "Head of Procurement",
    frequency: "Every ingestion cycle",
    regulation: "Company Delegation of Financial Authority; Companies Act 2017 (internal control)",
    severityRubric: AMOUNT_RUBRIC + " Amount at risk is the combined value of the split POs.",
    legitimateExplanations:
      "POs that serve different plants, different materials and separate approved purchase requisitions are separate requirements, not a split.",
  },
  {
    id: "P2P-03",
    process: "Procure-to-Pay",
    processCode: "P2P",
    name: "PO price above contract",
    risk: "Goods are bought above the negotiated contract price.",
    controlStatement: "PO unit prices must match the valid contract price; deviations need a price-variance approval memo.",
    ruleDescription: `PO unit price exceeds the valid contract price by more than ${PRICE_TOLERANCE * 100}%.`,
    sourceSystems: ["SAP MM (purchase orders)", "Contract price list"],
    owner: "Head of Procurement",
    frequency: "Every ingestion cycle",
    regulation: "Company procurement policy",
    severityRubric: AMOUNT_RUBRIC + " Amount at risk is (PO price - contract price) x quantity.",
    legitimateExplanations:
      "A documented price-variance approval memo signed by the Head of Procurement explains the variance.",
  },
  {
    id: "P2P-04",
    process: "Procure-to-Pay",
    processCode: "P2P",
    name: "Three-way match failure",
    risk: "Vendors are paid for more than was ordered or received.",
    controlStatement: "Invoices are paid only when invoice quantity and price agree to the GRN and PO.",
    ruleDescription: "Invoice quantity exceeds goods-received quantity, or invoice price exceeds PO price by more than 1%.",
    sourceSystems: ["SAP MM (PO, GRN)", "SAP FI-AP (invoices, payments)"],
    owner: "Head of Finance Operations (AP)",
    frequency: "Every ingestion cycle",
    regulation: "Companies Act 2017 (internal control); Sales Tax Act 1990",
    severityRubric: AMOUNT_RUBRIC + " Amount at risk is the over-billed value (excess quantity x price).",
    legitimateExplanations:
      "If the invoice was BLOCKED for payment by the ERP variance check and not paid, the control operated.",
  },
  {
    id: "P2P-05",
    process: "Procure-to-Pay",
    processCode: "P2P",
    name: "Vendor bank change before payment",
    risk: "A fraudulent bank-detail change diverts a vendor payment.",
    controlStatement: "Vendor bank changes are verified by call-back to the registered contact before any payment.",
    ruleDescription: `A payment is made within ${BANK_CHANGE_WINDOW_DAYS} days after the vendor's bank account was changed.`,
    sourceSystems: ["SAP MM (vendor master change log)", "SAP FI (payment run)"],
    owner: "Treasury Manager",
    frequency: "Every ingestion cycle",
    regulation: "Prevention of Electronic Crimes Act 2016 (fraud); Company treasury policy",
    severityRubric: "High if the change was not independently verified (payment at risk of diversion), regardless of amount.",
    legitimateExplanations: "A documented call-back verification to the registered contact before payment.",
  },
  {
    id: "O2C-01",
    process: "Order-to-Cash",
    processCode: "O2C",
    name: "Credit limit override",
    risk: "Goods are released to distributors beyond approved credit, increasing bad debt.",
    controlStatement: "Sales orders that take a distributor above its credit limit need a CFO-approved credit extension.",
    ruleDescription: "Order value plus outstanding balance exceeds the distributor's credit limit, and the order was released.",
    sourceSystems: ["SAP SD (sales orders)", "SAP FI-AR (customer balances)"],
    owner: "Head of Sales Operations / Credit Controller",
    frequency: "Every ingestion cycle",
    regulation: "Company credit policy; Companies Act 2017 (internal control)",
    severityRubric: AMOUNT_RUBRIC + " Amount at risk is the amount by which exposure exceeds the credit limit.",
    legitimateExplanations: "A documented temporary credit extension approved by the CFO and valid on the order date.",
  },
  {
    id: "O2C-02",
    process: "Order-to-Cash",
    processCode: "O2C",
    name: "Unauthorised discount",
    risk: "Products are sold below list price without authority.",
    controlStatement: `Discounts above ${DISCOUNT_LIMIT * 100}% need an approved trade-promotion scheme.`,
    ruleDescription: `Net selling price is more than ${DISCOUNT_LIMIT * 100}% below list price.`,
    sourceSystems: ["SAP SD (sales orders, price list)", "Trade promotion calendar"],
    owner: "Head of Sales",
    frequency: "Every ingestion cycle",
    regulation: "Competition Act 2010 s.10 (trade practices); Company pricing policy",
    severityRubric: AMOUNT_RUBRIC + " Amount at risk is the discount given beyond the 10% limit.",
    legitimateExplanations: "An approved trade-promotion scheme reference covering the SKU and date.",
  },
  {
    id: "INV-01",
    process: "Inventory",
    processCode: "INV",
    name: "Unapproved stock write-off",
    risk: "Stock is written off without proper authority, hiding theft or loss.",
    controlStatement: `Write-offs above PKR ${WRITE_OFF_THRESHOLD.toLocaleString("en-US")} need Plant Manager approval by someone other than the requester.`,
    ruleDescription: `Write-off above PKR ${WRITE_OFF_THRESHOLD.toLocaleString("en-US")} not approved by a Plant Manager, or approved by the requester.`,
    sourceSystems: ["SAP MM-IM (inventory movements)"],
    owner: "Plant Manager",
    frequency: "Every ingestion cycle",
    regulation: "Companies Act 2017 (books of account); Sales Tax Act 1990 (input tax on destroyed goods)",
    severityRubric: AMOUNT_RUBRIC + " Amount at risk is the write-off value. Self-approval raises the rating by one level (Low->Medium, Medium->High).",
    legitimateExplanations:
      "Near-expiry or damaged stock destroyed under the QA standing destruction approval with a witnessed destruction certificate.",
  },
  {
    id: "LOG-01",
    process: "Logistics",
    processCode: "LOG",
    name: "Freight over-billing",
    risk: "Transporters bill more kilometres than the standard route.",
    controlStatement: "Freight bills are checked against the standard route distance before payment.",
    ruleDescription: `Billed kilometres exceed the standard route distance by more than ${FREIGHT_KM_TOLERANCE * 100}%.`,
    sourceSystems: ["Transport management system (trips)", "SAP FI-AP (freight bills)"],
    owner: "Head of Logistics",
    frequency: "Every ingestion cycle",
    regulation: "Company logistics policy",
    severityRubric: AMOUNT_RUBRIC + " Amount at risk is excess km x rate per km.",
    legitimateExplanations: "A documented route diversion (road closure, NHA advisory) approved by the logistics desk.",
  },
  {
    id: "PAY-01",
    process: "Payroll & Labour Law",
    processCode: "PAY",
    name: "Wage below provincial minimum",
    risk: "Workers (including contract workers) are paid below the notified minimum wage.",
    controlStatement: "Every worker's monthly wage meets the notified minimum wage of the province where they work.",
    ruleDescription: "Monthly wage is below the provincial minimum wage (not adjusted for contracted hours).",
    sourceSystems: ["HR/Payroll", "IR audit app (service-provider wage sheets)", "Minimum wage notifications"],
    owner: "Head of Industrial Relations",
    frequency: "Every ingestion cycle",
    regulation: "Provincial minimum wage notifications; Sindh Factories Act 2015; KP Factories Act 2013; Factories Act 1934 (Punjab)",
    severityRubric:
      "Medium for a full-time worker paid below minimum wage; High if the shortfall is more than 20% of the minimum wage.",
    legitimateExplanations:
      "Part-time workers on fewer than 48 contracted hours per week are paid pro rata; compare the wage with minimum wage x (contracted hours / 48).",
  },
  {
    id: "PAY-02",
    process: "Payroll & Labour Law",
    processCode: "PAY",
    name: "Pay to inactive employees",
    risk: "Salaries are paid to terminated or inactive employees (ghost employees).",
    controlStatement: "Payroll stops on the termination date; only the final settlement is paid afterwards.",
    ruleDescription: "A payroll payment to an employee whose HR status is Terminated, dated after the termination date.",
    sourceSystems: ["HR/Payroll (employee master, payroll register)"],
    owner: "Head of HR",
    frequency: "Every ingestion cycle",
    regulation: "Companies Act 2017 (internal control); EOBI Act 1976",
    severityRubric: "High for any regular salary paid after termination (fraud indicator), regardless of amount.",
    legitimateExplanations: "A one-off final settlement (dues, leave encashment, gratuity) paid after termination.",
  },
  {
    id: "PAY-03",
    process: "Payroll & Labour Law",
    processCode: "PAY",
    name: "Excessive working hours",
    risk: "Workers exceed statutory working hours, a labour-law breach and safety risk.",
    controlStatement: `Weekly hours (normal + overtime) must not exceed ${WEEKLY_HOURS_LIMIT}.`,
    ruleDescription: `Biometric attendance shows more than ${WEEKLY_HOURS_LIMIT} hours in a week.`,
    sourceSystems: ["Biometric time & attendance"],
    owner: "Head of Industrial Relations",
    frequency: "Every ingestion cycle",
    regulation: "Factories Acts (weekly hours, overtime and rest); provincial labour departments",
    severityRubric: "Medium if 61-70 hours; High if more than 70 hours in the week.",
    legitimateExplanations:
      "A logged biometric device error (duplicate punch) that inflates hours; the corrected hours are within the limit.",
  },
  {
    id: "ITA-01",
    process: "IT Access",
    processCode: "ITA",
    name: "Segregation-of-duties conflict",
    risk: "One user can both create and pay vendors, or create and approve POs.",
    controlStatement: "No user holds conflicting ERP roles unless a time-bound, reviewed firefighter access is approved.",
    ruleDescription: "User holds a conflicting role pair (Vendor master + Payment run, or PO create + PO approve).",
    sourceSystems: ["SAP user roles (GRC extract)"],
    owner: "Head of IT",
    frequency: "Every ingestion cycle",
    regulation: "Companies Act 2017 (internal control); IIA Global Internal Audit Standards",
    severityRubric: "High for Vendor master + Payment run; Medium for PO create + PO approve.",
    legitimateExplanations: "Approved, time-bound firefighter access whose activity log was reviewed.",
  },
  {
    id: "ITA-02",
    process: "IT Access",
    processCode: "ITA",
    name: "Leaver with active ERP account",
    risk: "Former employees keep ERP access after leaving.",
    controlStatement: "ERP accounts are locked on the employee's termination date.",
    ruleDescription: "ERP account is active while the linked employee is Terminated in HR.",
    sourceSystems: ["SAP user master", "HR (employee master)"],
    owner: "Head of IT",
    frequency: "Every ingestion cycle",
    regulation: "Prevention of Electronic Crimes Act 2016 (unauthorised access)",
    severityRubric: "High if the account logged in after the termination date; Medium if it did not.",
    legitimateExplanations: "Inter-company transfer where the person was re-hired under a new employee ID on the same date.",
  },
  {
    id: "GL-01",
    process: "Financial Close",
    processCode: "GL",
    name: "Self-approved manual journals",
    risk: "Manual journals are posted without independent review, enabling misstatement.",
    controlStatement: `Manual journals are approved by someone other than the poster; journals above PKR ${JE_APPROVAL_THRESHOLD.toLocaleString("en-US")} always need approval.`,
    ruleDescription: `Journal posted and approved by the same user, or above PKR ${JE_APPROVAL_THRESHOLD.toLocaleString("en-US")} with no approver.`,
    sourceSystems: ["SAP FI-GL (journal entries)"],
    owner: "Finance Controller",
    frequency: "Every ingestion cycle",
    regulation: "Companies Act 2017 s.220 (books of account); Income Tax Ordinance 2001 (records)",
    severityRubric: AMOUNT_RUBRIC + " Amount at risk is the journal amount.",
    legitimateExplanations: "System-generated recurring entries posted by a batch job (source = recurring/batch) are not manual journals.",
  },
];

export const CONTROL_BY_ID: Record<string, ControlDef> = Object.fromEntries(CONTROLS.map((c) => [c.id, c]));

export const PROCESSES = Array.from(new Set(CONTROLS.map((c) => c.process)));

export function amountSeverity(amount: number): Severity {
  if (amount >= 1_000_000) return "High";
  if (amount >= 200_000) return "Medium";
  return "Low";
}
