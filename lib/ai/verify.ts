// Explanation faithfulness check (Phase 1 metric 7/7a): every record ID, date and
// amount the model cites must appear in (or be a simple sum/difference of figures in)
// the evidence the model was actually shown. Anything else is flagged "unverified".

export const ID_RE = /\b(?:PO|APV|GRN|PMT|BCR|SO|WO|TRP|PSL|ATT|UAR|JE|PR)-\d{3}-\d{4}\b|\b(?:V|M|CT|C|E|RT|U)-\d{4,5}\b|\bSKU-\d{3}\b|\bEXC-\d{4}-\d{3}\b/g;
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;

export interface Faithfulness {
  ok: boolean;
  checked: number;
  unverified: string[];
  ids: string[];
  dates: string[];
  amounts: string[];
}

function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.replace(ID_RE, " ").replace(DATE_RE, " ").match(NUM_RE) || []) {
    const v = Number(m.replace(/,/g, ""));
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function checkFaithfulness(claimTextRaw: string, corpus: string): Faithfulness {
  // models sometimes write IDs with unicode hyphens (E\u201110154); normalise before matching
  const claimText = claimTextRaw.replace(/[\u2010-\u2015\u2212]/g, "-");
  const ids = Array.from(new Set(claimText.match(ID_RE) || []));
  const dates = Array.from(new Set(claimText.match(DATE_RE) || []));
  const corpusIds = new Set(corpus.match(ID_RE) || []);
  const corpusDates = new Set(corpus.match(DATE_RE) || []);
  const corpusNums = numbersIn(corpus).filter((x) => x >= 100);
  const allowed = new Set<number>(corpusNums.map((x) => Math.round(x)));
  const big = Array.from(new Set(corpusNums.filter((x) => x >= 1000))).slice(0, 80);
  for (let i = 0; i < big.length; i++) for (let j = 0; j < big.length; j++) {
    allowed.add(Math.round(big[i] + big[j]));
    allowed.add(Math.round(Math.abs(big[i] - big[j])));
  }
  const unverified: string[] = [];
  for (const id of ids) if (!corpusIds.has(id)) unverified.push(id);
  for (const d of dates) if (!corpusDates.has(d)) unverified.push(d);
  const amounts = Array.from(new Set(numbersIn(claimText).filter((x) => x >= 1000 && !(x >= 1900 && x <= 2100))));
  for (const a of amounts) {
    const r = Math.round(a);
    if (!allowed.has(r) && !allowed.has(r + 1) && !allowed.has(r - 1)) unverified.push(a.toLocaleString("en-US"));
  }
  return { ok: unverified.length === 0, checked: ids.length + dates.length + amounts.length, unverified, ids, dates, amounts: amounts.map((a) => a.toLocaleString("en-US")) };
}
