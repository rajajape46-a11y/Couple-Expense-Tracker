import "server-only";
import { getCategories, getContext, getExistingForDuplicates } from "@/lib/data";
import { classify, type RawRow } from "./classify";

/** Classifies rows against what is already stored (new / duplicate / problem). */
export async function classifyAgainstStored(rows: RawRow[]) {
  const { people } = await getContext();
  const categories = await getCategories(true);
  const dates = rows.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
  const existing = dates.length ? await getExistingForDuplicates(dates[0], dates[dates.length - 1]) : [];
  return classify(rows, { people, categories }, existing);
}

/** Makes sure the payload is a list of well-formed rows (it came from the browser). */
export function sanitizeRows(input: unknown): RawRow[] {
  if (!Array.isArray(input)) throw new Error("Invalid import data.");
  if (input.length > 10000) throw new Error("Too many rows.");
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 500) : "");
  return input.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null;
    const amount = typeof o.amount === "number" && Number.isFinite(o.amount) ? o.amount : null;
    return {
      line: typeof o.line === "number" ? o.line : i + 1,
      date,
      merchant: s(o.merchant),
      category: s(o.category),
      subcategory: s(o.subcategory),
      expenseType: s(o.expenseType),
      paidBy: s(o.paidBy),
      split: s(o.split),
      paymentMethod: s(o.paymentMethod),
      amount,
      oneOff: o.oneOff === true,
      notes: s(o.notes),
    };
  });
}
