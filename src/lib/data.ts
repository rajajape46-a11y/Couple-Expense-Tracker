import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type {
  Category,
  ExpenseType,
  ImportRecord,
  MerchantMemory,
  Person,
  RecurringRule,
  Transaction,
} from "./types";

const TXN_FIELDS =
  "id,txn_date,merchant,category_id,subcategory_id,expense_type,paid_by,split_type,personal_for,payment_method,amount,is_one_off,notes,recurring_rule_id";

const toTxn = (r: Record<string, unknown>): Transaction =>
  ({ ...r, amount: Number(r.amount) }) as Transaction;

/** Supabase returns at most 1,000 rows per request; this pages through all of them. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

/** Signed-in user, their household and the people in it. Cached per request. */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: people, error }, { data: household }] = await Promise.all([
    supabase.from("people").select("id,name,user_id,sort_order").order("sort_order"),
    supabase.from("households").select("id,name").maybeSingle(),
  ]);
  if (error) throw new Error(error.message);

  const list = (people ?? []) as Person[];
  return {
    supabase,
    user: { id: user.id, email: user.email ?? "" },
    household: household as { id: string; name: string } | null,
    people: list,
    me: list.find((p) => p.user_id === user.id) ?? null,
  };
});

/**
 * Creates any recurring expenses that are due for this household. The daily
 * database job normally does this; calling it on page load is a safety net.
 */
export const catchUpRecurring = cache(async () => {
  const { supabase } = await getContext();
  const { data, error } = await supabase.rpc("run_my_recurring");
  if (error) console.error("run_my_recurring failed:", error.message);
  return (data as number | null) ?? 0;
});

export async function getCategories(includeArchived = false): Promise<Category[]> {
  const { supabase } = await getContext();
  const { data, error } = await supabase
    .from("categories")
    .select(
      "id,name,monthly_budget,sort_order,is_archived,subcategories(id,category_id,name,sort_order,is_archived)",
    )
    .order("sort_order")
    .order("name")
    .order("sort_order", { referencedTable: "subcategories" });
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((c) => ({
      ...c,
      monthly_budget: c.monthly_budget === null ? null : Number(c.monthly_budget),
      subcategories: (c.subcategories ?? []).filter(
        (s: { is_archived: boolean }) => includeArchived || !s.is_archived,
      ),
    }))
    .filter((c) => includeArchived || !c.is_archived) as Category[];
}

export async function getTransactions(opts: {
  from?: string;
  to?: string;
  q?: string;
  categoryId?: string;
  limit?: number;
  ascending?: boolean;
}): Promise<Transaction[]> {
  const { supabase } = await getContext();
  const build = () => {
    let query = supabase
      .from("transactions")
      .select(TXN_FIELDS)
      .is("deleted_at", null)
      .order("txn_date", { ascending: Boolean(opts.ascending) })
      .order("created_at", { ascending: Boolean(opts.ascending) })
      .order("id");
    if (opts.from) query = query.gte("txn_date", opts.from);
    if (opts.to) query = query.lt("txn_date", opts.to);
    if (opts.q) query = query.ilike("merchant", `%${opts.q.replace(/[%_]/g, "")}%`);
    if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
    return query;
  };
  if (opts.limit) {
    const { data, error } = await build().limit(opts.limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toTxn);
  }
  const rows = await fetchAll((a, b) => build().range(a, b));
  return rows.map(toTxn);
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const { supabase } = await getContext();
  const { data, error } = await supabase
    .from("transactions")
    .select(TXN_FIELDS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toTxn(data) : null;
}

/** Monthly totals per category from the database view. */
export async function getMonthlyTotals(from: string, to: string) {
  const { supabase } = await getContext();
  const rows = await fetchAll((a, b) =>
    supabase
      .from("monthly_category_totals")
      .select("month,category_id,total,one_off,txn_count")
      .gte("month", from)
      .lt("month", to)
      .order("month")
      .order("category_id")
      .range(a, b),
  );
  return rows.map((r) => ({
    month: String(r.month).slice(0, 7),
    category_id: r.category_id as string,
    total: Number(r.total),
    one_off: Number(r.one_off),
    txn_count: Number(r.txn_count),
  }));
}

/** Earliest month that has any expense (YYYY-MM), or null. */
export async function getFirstMonth(): Promise<string | null> {
  const { supabase } = await getContext();
  const { data } = await supabase
    .from("transactions")
    .select("txn_date")
    .is("deleted_at", null)
    .order("txn_date")
    .limit(1)
    .maybeSingle();
  return data ? String(data.txn_date).slice(0, 7) : null;
}

/** Stored expenses in a date range, for duplicate detection during import. */
export async function getExistingForDuplicates(from: string, to: string) {
  const { supabase } = await getContext();
  return fetchAll((a, b) =>
    supabase
      .from("transactions")
      .select("txn_date,amount,merchant")
      .is("deleted_at", null)
      .gte("txn_date", from)
      .lte("txn_date", to)
      .order("id")
      .range(a, b),
  ) as Promise<{ txn_date: string; amount: number; merchant: string }[]>;
}

export async function getImports(): Promise<ImportRecord[]> {
  const { supabase } = await getContext();
  const { data, error } = await supabase
    .from("imports")
    .select("id,file_name,rows_added,rows_skipped,created_at,undone_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportRecord[];
}

const RULE_FIELDS =
  "id,merchant,category_id,subcategory_id,expense_type,paid_by,split_type,personal_for,payment_method,amount,is_one_off,notes,frequency,start_date,end_date,next_index,is_active";

export async function getRecurringRules(): Promise<RecurringRule[]> {
  const { supabase } = await getContext();
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(RULE_FIELDS)
    .order("is_active", { ascending: false })
    .order("merchant");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as RecurringRule[];
}

export async function getRecurringRule(id: string): Promise<RecurringRule | null> {
  const { supabase } = await getContext();
  const { data, error } = await supabase.from("recurring_rules").select(RULE_FIELDS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ({ ...data, amount: Number(data.amount) } as RecurringRule) : null;
}

/**
 * Learns from recent history: the last-used settings per merchant (so typing
 * "Coles" fills in the rest), the most-used merchants, and the usual expense
 * type per sub-category.
 */
export async function getEntryHints() {
  const recent = await getTransactions({ limit: 500 });
  const memory: MerchantMemory = {};
  const subExpense: Record<string, ExpenseType> = {};
  for (const t of recent) {
    const key = t.merchant.trim().toLowerCase();
    if (!memory[key]) {
      memory[key] = {
        merchant: t.merchant.trim(),
        category_id: t.category_id,
        subcategory_id: t.subcategory_id,
        expense_type: t.expense_type,
        split_type: t.split_type,
        personal_for: t.personal_for,
        payment_method: t.payment_method,
        count: 0,
      };
    }
    memory[key].count += 1;
    if (t.subcategory_id && !subExpense[t.subcategory_id]) {
      subExpense[t.subcategory_id] = t.expense_type;
    }
  }
  const topMerchants = Object.values(memory)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((m) => m.merchant);
  return { memory, subExpense, topMerchants };
}
