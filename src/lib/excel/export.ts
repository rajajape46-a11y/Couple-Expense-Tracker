import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

/**
 * Builds an .xlsx in exactly the "Monthly expense log v2" layout by filling a
 * blank copy of that workbook (src/lib/excel/template.xlsx). Only cell values in
 * the Expense Log and Lists sheets are written, so the Dashboard, charts,
 * dropdowns, conditional formatting and formulas are kept as they are; Excel
 * recalculates everything when the file is opened.
 */

export type ExportRow = {
  date: string; // YYYY-MM-DD
  merchant: string;
  category: string;
  subcategory: string;
  expenseType: string;
  paidBy: string;
  split: string; // "Shared (50/50)" | "<name> only"
  paymentMethod: string;
  amount: number;
  oneOff: boolean;
  notes: string;
};

export type ExportData = {
  people: string[]; // first two are used
  categories: { name: string; budget: number | null; subcategories: string[] }[];
  rows: ExportRow[];
};

// Layout of the template (see the Lists / Expense Log sheets)
const LOG_SHEET = "xl/worksheets/sheet2.xml";
const LISTS_SHEET = "xl/worksheets/sheet4.xml";
const LOG_FIRST_ROW = 5;
const LOG_LAST_ROW = 3000;
const LISTS_FIRST_CAT_COL = 8; // H
const LISTS_MAX_CATS = 20; // H..AA
const LISTS_BUDGET_ROW = 5;
const LISTS_FIRST_SUB_ROW = 6;
const LISTS_MAX_SUBS = 40; // rows 6..45

export const MAX_EXPORT_ROWS = LOG_LAST_ROW - LOG_FIRST_ROW + 1;

const col = (n: number) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // characters not allowed in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** Excel serial date (days since 1899-12-30). */
export function excelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

type Value = string | number;

/**
 * Replaces empty styled cells (`<c r="A5" s="47" t="n"></c>`, as written by the
 * template) with the given values in a single pass, keeping each cell's style.
 */
function fillCells(xml: string, values: Map<string, Value>): { xml: string; missing: string[] } {
  const seen = new Set<string>();
  const out = xml.replace(/<c r="([A-Z]+\d+)" s="(\d+)"(?: t="n")?(?:\/>|><\/c>)/g, (whole, ref, s) => {
    const v = values.get(ref);
    if (v === undefined || v === "") return whole;
    seen.add(ref);
    if (typeof v === "number") return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  });
  const missing = [...values.keys()].filter((k) => !seen.has(k) && values.get(k) !== "");
  return { xml: out, missing };
}

let templateCache: Buffer | null = null;
async function template(): Promise<Buffer> {
  if (!templateCache) {
    templateCache = await readFile(path.join(process.cwd(), "src/lib/excel/template.xlsx"));
  }
  return templateCache;
}

export async function buildWorkbook(data: ExportData): Promise<Buffer> {
  if (data.rows.length > MAX_EXPORT_ROWS) {
    throw new Error(`The Excel layout holds ${MAX_EXPORT_ROWS} transactions; you have ${data.rows.length}.`);
  }
  const zip = await JSZip.loadAsync(await template());

  // ---- Expense Log
  const log = new Map<string, Value>();
  data.rows.forEach((r, i) => {
    const row = LOG_FIRST_ROW + i;
    log.set(`A${row}`, excelSerial(r.date));
    log.set(`B${row}`, r.merchant);
    log.set(`C${row}`, r.category);
    log.set(`D${row}`, r.subcategory);
    log.set(`E${row}`, r.expenseType);
    log.set(`F${row}`, r.paidBy);
    log.set(`G${row}`, r.split);
    log.set(`H${row}`, r.paymentMethod);
    log.set(`I${row}`, r.amount);
    log.set(`J${row}`, r.oneOff ? "Yes" : "No");
    log.set(`K${row}`, r.notes);
  });
  const logXml = await zip.file(LOG_SHEET)!.async("string");
  const logFilled = fillCells(logXml, log);
  if (logFilled.missing.length) throw new Error(`Template is missing cells: ${logFilled.missing.slice(0, 5).join(", ")}`);
  zip.file(LOG_SHEET, logFilled.xml);

  // ---- Lists (people, categories, budgets, sub-categories)
  const lists = new Map<string, Value>();
  data.people.slice(0, 2).forEach((p, i) => lists.set(`A${5 + i}`, p));
  data.categories.slice(0, LISTS_MAX_CATS).forEach((c, j) => {
    const letter = col(LISTS_FIRST_CAT_COL + j);
    lists.set(`${letter}4`, c.name);
    if (c.budget && c.budget > 0) lists.set(`${letter}${LISTS_BUDGET_ROW}`, c.budget);
    c.subcategories.slice(0, LISTS_MAX_SUBS).forEach((s, k) => lists.set(`${letter}${LISTS_FIRST_SUB_ROW + k}`, s));
  });
  const listsXml = await zip.file(LISTS_SHEET)!.async("string");
  const listsFilled = fillCells(listsXml, lists);
  if (listsFilled.missing.length) throw new Error(`Template is missing cells: ${listsFilled.missing.slice(0, 5).join(", ")}`);
  zip.file(LISTS_SHEET, listsFilled.xml);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
