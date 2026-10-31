// PII masking applied to every record before it is placed in a model prompt.
// Identity (CNIC, EOBI), bank (IBAN/account) and tax (NTN) numbers are masked.
// Amounts, wages and prices are NOT masked because they are what the controls test (Phase 1, row 6b).

const MASK_KEYS: Record<string, (v: string) => string> = {
  cnic: (v) => `*****-*******-${v.slice(-1)}`,
  eobi_no: () => "EOBI-*********",
  ntn: () => "*******-*",
  iban: (v) => `${v.slice(0, 4)}************${v.slice(-4)}`,
  old_iban: (v) => `${v.slice(0, 4)}************${v.slice(-4)}`,
  new_iban: (v) => `${v.slice(0, 4)}************${v.slice(-4)}`,
  paid_to_iban: (v) => `${v.slice(0, 4)}************${v.slice(-4)}`,
  bank_account: (v) => `${v.slice(0, 4)}************${v.slice(-4)}`,
};

export function mask<T>(obj: T, counter = { n: 0 }): T {
  if (Array.isArray(obj)) return obj.map((x) => mask(x, counter)) as any;
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj as any)) {
      if (typeof v === "string" && MASK_KEYS[k]) { out[k] = MASK_KEYS[k](v); counter.n++; }
      else out[k] = mask(v, counter);
    }
    return out;
  }
  return obj;
}

export const MASKED_FIELDS = Object.keys(MASK_KEYS);
