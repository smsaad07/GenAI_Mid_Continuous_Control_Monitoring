// Synthetic master data for "the Company" (anonymised biscuit & cake manufacturer).
// ALL names, identity numbers, bank accounts and tax numbers are randomly generated.
import { Rng, pad } from "../rng";

export const PLANTS = [
  { code: "KHI", name: "Karachi Factory", province: "Sindh", cnicPrefix: "42101" },
  { code: "HTR", name: "Hattar Factory", province: "Khyber Pakhtunkhwa", cnicPrefix: "13101" },
  { code: "LHR", name: "Lahore Factory", province: "Punjab", cnicPrefix: "35202" },
] as const;

export const ROLE_CONFLICTS: [string, string][] = [
  ["VENDOR_MASTER", "PAYMENT_RUN"],
  ["PO_CREATE", "PO_APPROVE"],
];

const FIRST = ["Ahmed", "Ali", "Usman", "Bilal", "Hamza", "Faisal", "Imran", "Kashif", "Naveed", "Rizwan", "Sajid", "Tariq", "Waqas", "Zeeshan", "Asad", "Danish", "Farhan", "Junaid", "Kamran", "Salman", "Ayesha", "Fatima", "Hina", "Maryam", "Nadia", "Rabia", "Sana", "Sadia", "Uzma", "Zainab", "Amna", "Iqra", "Mehwish", "Saba", "Shazia", "Noman", "Adeel", "Shahid", "Yasir", "Arif"];
const LAST = ["Khan", "Qureshi", "Siddiqui", "Sheikh", "Malik", "Butt", "Chaudhry", "Awan", "Abbasi", "Raza", "Hashmi", "Mirza", "Baig", "Ansari", "Jamali", "Memon", "Afridi", "Yousafzai", "Rana", "Bhatti", "Shah", "Naqvi", "Zaidi", "Soomro", "Lodhi"];

const VENDOR_A = ["Crescent", "Indus", "Mehran", "Ravi", "Margalla", "Kohinoor", "Sapphire", "Bolan", "Chenab", "Karakoram", "Saffron", "Lyallpur", "Shalimar", "Kirthar", "Hingol", "Thar", "Swat", "Potohar", "Gandhara", "Zarghun"];
const VENDOR_B = ["Agro Mills", "Packaging Works", "Edible Oils", "Sugar Traders", "Polyfilm", "Carton Industries", "Dairy Ingredients", "Food Chemicals", "Logistics", "Goods Transport", "Security Services", "Catering Services", "Manpower Services", "Engineering Services", "Properties"];

export const MATERIALS = [
  { id: "M-2001", name: "Wheat flour (50 kg bag)", unit: "bag", base: 6500 },
  { id: "M-2002", name: "Refined sugar (50 kg bag)", unit: "bag", base: 7800 },
  { id: "M-2003", name: "Vegetable ghee (16 kg tin)", unit: "tin", base: 8200 },
  { id: "M-2004", name: "Cocoa powder (25 kg)", unit: "bag", base: 52000 },
  { id: "M-2005", name: "Glucose syrup", unit: "kg", base: 260 },
  { id: "M-2006", name: "Milk powder (25 kg)", unit: "bag", base: 38000 },
  { id: "M-2007", name: "BOPP wrapper film", unit: "kg", base: 820 },
  { id: "M-2008", name: "Corrugated cartons", unit: "pc", base: 95 },
  { id: "M-2009", name: "Eggs (tray of 30)", unit: "tray", base: 1050 },
  { id: "M-2010", name: "Baking powder (25 kg)", unit: "bag", base: 9500 },
  { id: "M-2011", name: "Flavours", unit: "kg", base: 4200 },
  { id: "M-2012", name: "Cream filling fat", unit: "kg", base: 640 },
];

export const PRODUCTS = [
  { sku: "SKU-101", name: "Glucose biscuit family pack (carton)", list: 2400 },
  { sku: "SKU-102", name: "Chocolate sandwich biscuit (carton)", list: 3600 },
  { sku: "SKU-103", name: "Butter cookies tin (carton)", list: 4800 },
  { sku: "SKU-104", name: "Tea biscuit snack pack (carton)", list: 1800 },
  { sku: "SKU-105", name: "Cream wafer (carton)", list: 3100 },
  { sku: "SKU-106", name: "Sponge cake slice (carton)", list: 2900 },
  { sku: "SKU-107", name: "Fruit cake 250 g (carton)", list: 4200 },
  { sku: "SKU-108", name: "Cup cake chocolate (carton)", list: 2700 },
  { sku: "SKU-109", name: "Salted cracker (carton)", list: 2100 },
  { sku: "SKU-110", name: "Digestive biscuit (carton)", list: 3900 },
  { sku: "SKU-111", name: "Coconut biscuit (carton)", list: 2300 },
  { sku: "SKU-112", name: "Marble cake (carton)", list: 3300 },
];

export const CITIES = ["Karachi", "Hyderabad", "Sukkur", "Quetta", "Multan", "Lahore", "Faisalabad", "Gujranwala", "Rawalpindi", "Islamabad", "Peshawar", "Mardan", "Abbottabad", "Sialkot", "Bahawalpur"];

export const ROUTES = [
  { id: "RT-01", origin: "KHI", destination: "Hyderabad", km: 165 },
  { id: "RT-02", origin: "KHI", destination: "Sukkur", km: 475 },
  { id: "RT-03", origin: "KHI", destination: "Quetta", km: 690 },
  { id: "RT-04", origin: "KHI", destination: "Multan", km: 905 },
  { id: "RT-05", origin: "LHR", destination: "Faisalabad", km: 185 },
  { id: "RT-06", origin: "LHR", destination: "Gujranwala", km: 80 },
  { id: "RT-07", origin: "LHR", destination: "Rawalpindi", km: 375 },
  { id: "RT-08", origin: "LHR", destination: "Multan", km: 340 },
  { id: "RT-09", origin: "LHR", destination: "Bahawalpur", km: 420 },
  { id: "RT-10", origin: "HTR", destination: "Peshawar", km: 75 },
  { id: "RT-11", origin: "HTR", destination: "Islamabad", km: 60 },
  { id: "RT-12", origin: "HTR", destination: "Mardan", km: 95 },
  { id: "RT-13", origin: "HTR", destination: "Lahore", km: 430 },
  { id: "RT-14", origin: "LHR", destination: "Sialkot", km: 135 },
  { id: "RT-15", origin: "HTR", destination: "Abbottabad", km: 70 },
];

export interface Vendor {
  id: string; name: string; category: string; kind: "goods" | "service" | "transport";
  materials: string[]; iban: string; ntn: string; city: string; monthly_fee?: number;
}
export interface Contract { id: string; vendor_id: string; material_id: string; price: number; valid_from: string; valid_to: string }
export interface Customer { id: string; name: string; city: string; credit_limit: number; ntn: string }
export interface Employee {
  id: string; name: string; cnic: string; eobi_no: string; plant: string; province: string; department: string;
  employment_type: "Permanent" | "Contract worker"; contractor_id: string | null; monthly_wage: number;
  contracted_hours_per_week: number; status: "Active" | "Terminated"; termination_date: string | null;
  leaver_type: "Resigned" | "Dismissed" | "Inter-company transfer" | null; notes: string | null; bank_account: string;
}
export interface ErpUser { id: string; username: string; employee_id: string; roles: string[]; status: "Active" | "Locked"; department: string }

export interface Master {
  vendors: Vendor[]; contracts: Contract[]; customers: Customer[]; employees: Employee[]; users: ErpUser[];
  materials: typeof MATERIALS; products: typeof PRODUCTS; routes: (typeof ROUTES[number] & { rate_per_km: number })[];
}

function iban(r: Rng) {
  const banks = ["HABB", "MUCB", "UNIL", "ABPA", "MEZN", "BAHL", "NBPA", "ALFH"];
  return `PK${r.digits(2)}${r.pick(banks)}${r.digits(16)}`;
}

export function generateMaster(seed = "ccm-master-2026"): Master {
  const r = new Rng(seed);

  // Vendors
  const vendors: Vendor[] = [];
  const usedNames = new Set<string>();
  const kinds: { cat: string; kind: Vendor["kind"]; suffix: string[]; n: number }[] = [
    { cat: "Raw material", kind: "goods", suffix: ["Agro Mills", "Edible Oils", "Sugar Traders", "Dairy Ingredients", "Food Chemicals"], n: 18 },
    { cat: "Packaging", kind: "goods", suffix: ["Packaging Works", "Polyfilm", "Carton Industries"], n: 8 },
    { cat: "Transport", kind: "transport", suffix: ["Logistics", "Goods Transport"], n: 6 },
    { cat: "Security", kind: "service", suffix: ["Security Services"], n: 3 },
    { cat: "Canteen", kind: "service", suffix: ["Catering Services"], n: 3 },
    { cat: "Labour contractor", kind: "service", suffix: ["Manpower Services"], n: 4 },
    { cat: "Maintenance", kind: "service", suffix: ["Engineering Services"], n: 3 },
    { cat: "Rent", kind: "service", suffix: ["Properties"], n: 3 },
  ];
  let vid = 1001;
  for (const k of kinds) {
    for (let i = 0; i < k.n; i++) {
      let name = "";
      do name = `${r.pick(VENDOR_A)} ${r.pick(k.suffix)} (Pvt) Ltd`; while (usedNames.has(name));
      usedNames.add(name);
      const mats =
        k.cat === "Raw material" ? r.sample(MATERIALS.filter((m) => !["M-2007", "M-2008"].includes(m.id)).map((m) => m.id), 3)
        : k.cat === "Packaging" ? r.sample(["M-2007", "M-2008"], r.int(1, 2))
        : [];
      vendors.push({
        id: `V-${vid++}`, name, category: k.cat, kind: k.kind, materials: mats, iban: iban(r),
        ntn: `${r.digits(7)}-${r.int(0, 9)}`, city: r.pick(CITIES),
        monthly_fee: k.kind === "service" ? r.int(18, 140) * 10_000 + r.int(0, 999) : undefined,
      });
    }
  }

  // Contracts (price list valid for calendar 2026)
  const contracts: Contract[] = [];
  let cid = 3001;
  for (const v of vendors) for (const m of v.materials) {
    const base = MATERIALS.find((x) => x.id === m)!.base;
    contracts.push({ id: `CT-${cid++}`, vendor_id: v.id, material_id: m, price: Math.round(base * r.float(0.95, 1.05)), valid_from: "2026-01-01", valid_to: "2026-12-31" });
  }

  // Customers (distributors)
  const customers: Customer[] = [];
  for (let i = 0; i < 40; i++) {
    const city = CITIES[i % CITIES.length];
    customers.push({ id: `C-${5001 + i}`, name: `${r.pick(VENDOR_A)} Distributors ${city}`, city, credit_limit: r.int(20, 150) * 100_000, ntn: `${r.digits(7)}-${r.int(0, 9)}` });
  }

  // Employees
  const employees: Employee[] = [];
  const contractors = vendors.filter((v) => v.category === "Labour contractor");
  const depts = ["Production", "Production", "Production", "Packing", "Warehouse", "Quality Assurance", "Maintenance", "Procurement", "Finance", "Sales", "HR", "IT", "Logistics"];
  for (let i = 0; i < 320; i++) {
    const plant = PLANTS[i % 3];
    const dept = r.pick(depts);
    const isContract = ["Production", "Packing", "Warehouse"].includes(dept) && r.chance(0.55);
    const office = ["Procurement", "Finance", "Sales", "HR", "IT", "Logistics"].includes(dept);
    const partTime = isContract && r.chance(0.06);
    const hours = partTime ? r.pick([24, 30, 36]) : 48;
    const fullWage = office ? r.int(85, 320) * 1000 : isContract ? r.int(41, 52) * 1000 : r.int(45, 95) * 1000;
    employees.push({
      id: `E-${10001 + i}`,
      name: `${r.pick(FIRST)} ${r.pick(LAST)}`,
      cnic: `${plant.cnicPrefix}-${r.digits(7)}-${r.int(1, 9)}`,
      eobi_no: `EOBI-${r.digits(9)}`,
      plant: plant.code, province: plant.province, department: dept,
      employment_type: isContract ? "Contract worker" : "Permanent",
      contractor_id: isContract ? r.pick(contractors).id : null,
      monthly_wage: partTime ? Math.round((fullWage * hours) / 48 / 100) * 100 + 1000 : fullWage,
      contracted_hours_per_week: hours,
      status: "Active", termination_date: null, leaver_type: null, notes: null,
      bank_account: iban(r),
    });
  }

  // ERP users: office staff
  const office = employees.filter((e) => ["Procurement", "Finance", "Sales", "HR", "IT", "Logistics", "Warehouse"].includes(e.department));
  const roleByDept: Record<string, string[][]> = {
    Procurement: [["PO_CREATE"], ["PO_APPROVE"], ["PO_CREATE", "GRN_POST"]],
    Finance: [["AP_INVOICE"], ["PAYMENT_RUN"], ["VENDOR_MASTER"], ["GL_POST"], ["GL_APPROVE"], ["GL_POST", "AP_INVOICE"]],
    Sales: [["SD_ORDER"], ["CREDIT_RELEASE"], ["SD_ORDER", "CREDIT_RELEASE"]],
    HR: [["HR_PAYROLL"]],
    IT: [["BASIS_ADMIN"]],
    Logistics: [["TMS_TRIPS"]],
    Warehouse: [["GRN_POST"], ["INV_WRITEOFF"]],
  };
  const users: ErpUser[] = office.map((e, i) => ({
    id: `U-${pad(4001 + i, 4)}`,
    username: (e.name.split(" ")[0][0] + e.name.split(" ")[1]).toUpperCase().slice(0, 10) + String(i % 10),
    employee_id: e.id,
    roles: r.pick(roleByDept[e.department]),
    status: "Active",
    department: e.department,
  }));

  // Leavers: some office users leave (locked accounts), some transferred & re-hired
  const leaverUsers = r.sample(users, 14);
  leaverUsers.forEach((u, i) => {
    const e = employees.find((x) => x.id === u.employee_id)!;
    e.status = "Terminated";
    e.termination_date = `2026-${pad(r.int(3, 6), 2)}-${pad(r.int(1, 28), 2)}`;
    u.status = "Locked";
    if (i < 5) {
      e.leaver_type = "Inter-company transfer";
      const newId = `E-${10001 + employees.length}`;
      e.notes = `Inter-company transfer to group company; re-hired as ${newId} on ${e.termination_date}.`;
      employees.push({ ...e, id: newId, status: "Active", termination_date: null, leaver_type: null, notes: `Re-hired on transfer; previous employee ID ${e.id}.`, eobi_no: e.eobi_no });
    } else {
      e.leaver_type = r.chance(0.7) ? "Resigned" : "Dismissed";
      e.notes = `${e.leaver_type}; full and final settlement processed.`;
    }
  });
  // Some non-office leavers too (for payroll tests)
  for (const e of r.sample(employees.filter((x) => x.status === "Active" && !users.some((u) => u.employee_id === x.id)), 16)) {
    e.status = "Terminated";
    e.termination_date = `2026-${pad(r.int(3, 6), 2)}-${pad(r.int(1, 28), 2)}`;
    e.leaver_type = r.chance(0.75) ? "Resigned" : "Dismissed";
    e.notes = `${e.leaver_type}; full and final settlement processed.`;
  }

  const routes = ROUTES.map((rt) => ({ ...rt, rate_per_km: r.int(26, 32) * 10 }));

  return { vendors, contracts, customers, employees, users, materials: MATERIALS, products: PRODUCTS, routes };
}
