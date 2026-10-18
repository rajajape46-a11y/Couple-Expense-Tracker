/**
 * Turns rows read from an Excel file into transactions: resolves names to the
 * app's categories / people, and decides for each row whether it is new, a
 * duplicate of something already stored, or has a problem to fix.
 *
 * Duplicate = same date + same amount + same merchant (ignoring capitals and
 * extra spaces). Matching is count-based: if the file has the same purchase
 * twice and the app has it once, one copy is new and one is a duplicate.
 */
import { EXPENSE_TYPES, PAYMENT_METHODS, type Category, type Person } from "../types";

export type RawRow = {
  line: number; // row number in the sheet (for messages)
  date: string | null; // YYYY-MM-DD
  merchant: string;
  category: string;
  subcategory: string;
  expenseType: string;
  paidBy: string;
  split: string;
  paymentMethod: string;
  amount: number | null;
  oneOff: boolean;
  notes: string;
};

export type ResolvedRow = {
  txn_date: string;
  merchant: string;
  category_id: string;
  subcategory_id: string | null;
  expense_type: string;
  paid_by: string;
  split_type: "shared" | "personal";
  personal_for: string | null;
  payment_method: string | null;
  amount: number;
  is_one_off: boolean;
  notes: string | null;
};

export type Classified =
  | { status: "new"; raw: RawRow; row: ResolvedRow }
  | { status: "duplicate"; raw: RawRow }
  | { status: "problem"; raw: RawRow; reasons: string[] };

export type MissingCategory = { category: string; subcategory: string };

export type ExistingTxn = { txn_date: string; amount: number; merchant: string };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export const dupKey = (date: string, amount: number, merchant: string) =>
  `${date}|${amount.toFixed(2)}|${norm(merchant)}`;

/** Category names used by the very first spreadsheet → today's names. */
const LEGACY: Record<string, [string, string]> = {
  "supermarket & groceries": ["Food & Groceries", "Supermarket & Groceries"],
  "takeaway & coffee": ["Food & Groceries", "Takeaway & Coffee"],
  "dining out & date nights": ["Food & Groceries", "Dining Out & Date Nights"],
  "household supplies": ["Housing & Rent", "Household Supplies"],
  "rent / mortgage": ["Housing & Rent", "Rent"],
  "home internet & mobile": ["Utilities & Phone", "Mobile Plan"],
  "public transport (myki/opal)": ["Transport", "Public Transport (Myki)"],
  "rideshare (uber/didi)": ["Transport", "Rideshare & Taxi"],
  "private health insurance": ["Health & Insurance", "Health Insurance"],
  "education expenses": ["Education", "Course Fees"],
  "movies, events & hobbies": ["Lifestyle & Entertainment", "Movies, Events & Hobbies"],
  "wife personal allowance": ["Personal", "Personal Allowance"],
  "husband personal allowance": ["Personal", "Personal Allowance"],
};

export function classify(
  rows: RawRow[],
  ctx: { people: Person[]; categories: Category[] },
  existing: ExistingTxn[],
): { items: Classified[]; missing: MissingCategory[] } {
  const existingCount = new Map<string, number>();
  for (const e of existing) {
    const k = dupKey(e.txn_date, Number(e.amount), e.merchant);
    existingCount.set(k, (existingCount.get(k) ?? 0) + 1);
  }
  const seen = new Map<string, number>();

  const catByName = new Map(ctx.categories.map((c) => [norm(c.name), c]));
  const people = [...ctx.people].sort((a, b) => a.sort_order - b.sort_order);
  const personByName = new Map(people.map((p) => [norm(p.name), p]));
  const missing = new Map<string, MissingCategory>();

  const items: Classified[] = rows.map((raw) => {
    const basic: string[] = [];
    if (!raw.date) basic.push("Missing or invalid date");
    if (raw.amount === null || !Number.isFinite(raw.amount) || raw.amount === 0) basic.push("Missing amount");
    if (!raw.merchant.trim()) basic.push("Missing merchant / description");
    if (basic.length) return { status: "problem", raw, reasons: basic };

    const amount = Math.round(raw.amount! * 100) / 100;
    const key = dupKey(raw.date!, amount, raw.merchant);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n <= (existingCount.get(key) ?? 0)) return { status: "duplicate", raw };

    const reasons: string[] = [];

    // ---- category & sub-category
    let catName = raw.category.trim();
    let subName = raw.subcategory.trim();
    let cat = catByName.get(norm(catName));
    if (!cat || (subName && !cat.subcategories.some((s) => norm(s.name) === norm(subName)))) {
      const legacy = LEGACY[norm(subName)];
      if (legacy && catByName.get(norm(legacy[0]))) {
        catName = legacy[0];
        subName = legacy[1];
        cat = catByName.get(norm(catName));
      }
    }
    let subId: string | null = null;
    if (!catName) {
      reasons.push("Missing category");
    } else if (!cat) {
      reasons.push(`Unknown category "${catName}"`);
      missing.set(norm(catName) + "|" + norm(subName), { category: catName, subcategory: subName });
    } else if (subName) {
      const sub = cat.subcategories.find((s) => norm(s.name) === norm(subName));
      if (sub) subId = sub.id;
      else {
        reasons.push(`Unknown sub-category "${subName}" in ${cat.name}`);
        missing.set(norm(cat.name) + "|" + norm(subName), { category: cat.name, subcategory: subName });
      }
    }

    // ---- expense type
    const et = EXPENSE_TYPES.find((t) => norm(t) === norm(raw.expenseType));
    if (!et) reasons.push(raw.expenseType ? `Unknown expense type "${raw.expenseType}"` : "Missing expense type");

    // ---- paid by
    const payer = personByName.get(norm(raw.paidBy));
    if (!payer) reasons.push(raw.paidBy ? `Unknown person "${raw.paidBy}" in Paid By` : "Missing Paid By");

    // ---- split
    let split_type: "shared" | "personal" = "shared";
    let personal_for: string | null = null;
    const sp = norm(raw.split);
    if (sp && !sp.includes("shared") && !sp.includes("50/50")) {
      let owner: Person | undefined;
      if (sp === "personal - husband") owner = people[0];
      else if (sp === "personal - wife") owner = people[1];
      else owner = personByName.get(sp.replace(/\s+only$/, ""));
      if (owner) {
        split_type = "personal";
        personal_for = owner.id;
      } else reasons.push(`Unknown split type "${raw.split}"`);
    }

    const payment = PAYMENT_METHODS.find((m) => norm(m) === norm(raw.paymentMethod)) ?? null;

    if (reasons.length || !cat || !et || !payer) return { status: "problem", raw, reasons };
    return {
      status: "new",
      raw,
      row: {
        txn_date: raw.date!,
        merchant: raw.merchant.trim(),
        category_id: cat.id,
        subcategory_id: subId,
        expense_type: et,
        paid_by: payer.id,
        split_type,
        personal_for,
        payment_method: payment,
        amount,
        is_one_off: raw.oneOff,
        notes: raw.notes.trim() || null,
      },
    };
  });

  return { items, missing: [...missing.values()] };
}
