import "server-only";
import { readXlsx, type CellVal } from "./read-xlsx";
import type { RawRow } from "./classify";

/**
 * Reads the expense rows out of an uploaded workbook. Works with the current
 * "Monthly expense log v2" file, files exported from this app, and the very
 * first "Monthly expense log" layout: the header row is found by name, so the
 * column order doesn't matter.
 */

const ALIASES: Record<keyof Omit<RawRow, "line">, string[]> = {
  date: ["date"],
  merchant: ["merchant / description", "merchant", "description", "merchant/description"],
  category: ["main category", "category"],
  subcategory: ["sub-category", "subcategory", "sub category"],
  expenseType: ["expense type", "type"],
  paidBy: ["paid by", "paidby"],
  split: ["split type", "split"],
  paymentMethod: ["payment method", "payment"],
  amount: ["amount ($)", "amount", "amount (aud)"],
  oneOff: ["one-off?", "one-off", "one off", "oneoff"],
  notes: ["notes", "note"],
};

const MAX_ROWS = 10000;

type CellValue = CellVal;

function text(v: CellValue): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

const raw = (v: CellValue) => v;

const pad = (n: number) => String(n).padStart(2, "0");

function toDate(v: CellValue): string | null {
  v = raw(v);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = text(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // Australian dd/mm/yyyy
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function toAmount(v: CellValue): number | null {
  v = raw(v);
  if (typeof v === "number") return v;
  let s = text(v).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()$,\s-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function parseWorkbook(buf: ArrayBuffer): Promise<{ rows: RawRow[]; sheet: string }> {
  const all = await readXlsx(buf);
  const candidates = [
    ...all.filter((w) => key(w.name) === "expense log"),
    ...all.filter((w) => key(w.name) !== "expense log"),
  ];

  for (const ws of candidates) {
    // find the header row (within the first 15 rows) that has Date and Amount
    for (let r = 1; r <= Math.min(15, ws.maxRow); r++) {
      const headers = new Map<string, number>();
      for (const [c, v] of ws.cells.get(r) ?? []) headers.set(key(text(v)), c);
      const colOf = (field: keyof typeof ALIASES) =>
        ALIASES[field].map((a) => headers.get(a)).find((c) => c !== undefined);
      if (!colOf("date") || !colOf("amount")) continue;

      const cols = Object.fromEntries(
        (Object.keys(ALIASES) as (keyof typeof ALIASES)[]).map((f) => [f, colOf(f)]),
      ) as Record<keyof typeof ALIASES, number | undefined>;

      const rows: RawRow[] = [];
      for (let i = r + 1; i <= ws.maxRow; i++) {
        const row = ws.cells.get(i);
        if (!row) continue;
        const get = (f: keyof typeof ALIASES): CellValue => (cols[f] ? (row.get(cols[f]!) ?? null) : null);
        const t = (f: keyof typeof ALIASES) => text(get(f)).trim();
        const date = toDate(get("date"));
        const amount = toAmount(get("amount"));
        const merchant = t("merchant");
        if (!date && amount === null && !merchant) continue; // blank line
        const oneOff = get("oneOff");
        rows.push({
          line: i,
          date,
          merchant,
          category: t("category"),
          subcategory: t("subcategory"),
          expenseType: t("expenseType"),
          paidBy: t("paidBy"),
          split: t("split"),
          paymentMethod: t("paymentMethod"),
          amount,
          oneOff: oneOff === true || ["yes", "y", "true", "1"].includes(text(oneOff).trim().toLowerCase()),
          notes: t("notes"),
        });
        if (rows.length > MAX_ROWS) throw new Error(`The file has more than ${MAX_ROWS} rows.`);
      }
      return { rows, sheet: ws.name };
    }
  }
  throw new Error('No expense sheet found. The file needs a header row with at least "Date" and "Amount".');
}
