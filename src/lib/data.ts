import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type {
  Category,
  ExpenseType,
  MerchantMemory,
  Person,
  Transaction,
} from "./types";

const TXN_FIELDS =
  "id,txn_date,merchant,category_id,subcategory_id,expense_type,paid_by,split_type,personal_for,payment_method,amount,is_one_off,notes";

const toTxn = (r: Record<string, unknown>): Transaction =>
  ({ ...r, amount: Number(r.amount) }) as Transaction;

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
}): Promise<Transaction[]> {
  const { supabase } = await getContext();
  let query = supabase
    .from("transactions")
    .select(TXN_FIELDS)
    .is("deleted_at", null)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts.from) query = query.gte("txn_date", opts.from);
  if (opts.to) query = query.lt("txn_date", opts.to);
  if (opts.q) query = query.ilike("merchant", `%${opts.q.replace(/[%_]/g, "")}%`);
  if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(toTxn);
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

/** Everything ever logged, for running balances (small data set: fine to load). */
export async function getAllForBalance() {
  const { supabase } = await getContext();
  const { data, error } = await supabase
    .from("transactions")
    .select("amount,paid_by,split_type,personal_for")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as Pick<
    Transaction,
    "amount" | "paid_by" | "split_type" | "personal_for"
  >[];
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
