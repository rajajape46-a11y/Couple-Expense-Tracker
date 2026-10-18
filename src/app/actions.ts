"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/data";
import { money } from "@/lib/format";
import { EXPENSE_TYPES, PAYMENT_METHODS, type FormState } from "@/lib/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function friendly(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "That name already exists.";
  return error.message;
}

// ---------------------------------------------------------------- auth

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: "Email or password is incorrect." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------- transactions

export async function saveTransaction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, people } = await getContext();

  const id = str(fd, "id");
  const intent = str(fd, "intent");
  const amount = Number(str(fd, "amount").replace(/[$,\s]/g, ""));
  const merchant = str(fd, "merchant");
  const txn_date = str(fd, "txn_date");
  const category_id = str(fd, "category_id");
  const subcategory_id = str(fd, "subcategory_id") || null;
  const expense_type = str(fd, "expense_type");
  const paid_by = str(fd, "paid_by");
  const split = str(fd, "split"); // "shared" or a person id
  const payment_method = str(fd, "payment_method") || null;
  const is_one_off = fd.get("is_one_off") === "on";
  const notes = str(fd, "notes") || null;

  if (!Number.isFinite(amount) || amount === 0) return { ok: false, message: "Enter an amount." };
  if (Math.abs(amount) >= 10_000_000) return { ok: false, message: "That amount looks too large." };
  if (!merchant) return { ok: false, message: "Enter who you paid (merchant / description)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txn_date)) return { ok: false, message: "Pick a date." };
  if (!category_id) return { ok: false, message: "Pick a category." };
  if (!subcategory_id) return { ok: false, message: "Pick a sub-category." };
  if (!(EXPENSE_TYPES as readonly string[]).includes(expense_type))
    return { ok: false, message: "Pick Fixed Needs or Variable Wants." };
  if (!people.some((p) => p.id === paid_by)) return { ok: false, message: "Pick who paid." };
  if (split !== "shared" && !people.some((p) => p.id === split))
    return { ok: false, message: "Pick how it is split." };
  if (payment_method && !(PAYMENT_METHODS as readonly string[]).includes(payment_method))
    return { ok: false, message: "Unknown payment method." };

  const row = {
    txn_date,
    merchant,
    category_id,
    subcategory_id,
    expense_type,
    paid_by,
    split_type: split === "shared" ? "shared" : "personal",
    personal_for: split === "shared" ? null : split,
    payment_method,
    amount: Math.round(amount * 100) / 100,
    is_one_off,
    notes,
  };

  const { error } = id
    ? await supabase.from("transactions").update(row).eq("id", id)
    : await supabase.from("transactions").insert(row);
  if (error) return { ok: false, message: friendly(error) };

  revalidatePath("/", "layout");
  if (intent === "again") {
    return { ok: true, message: `Saved ${merchant} · ${money(row.amount)}`, savedAt: Date.now() };
  }
  redirect(`/transactions?month=${txn_date.slice(0, 7)}`);
}

export async function deleteTransaction(fd: FormData) {
  const { supabase } = await getContext();
  const id = str(fd, "id");
  const month = str(fd, "month");
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect(month ? `/transactions?month=${month}` : "/transactions");
}

// ---------------------------------------------------------------- categories

function parseBudget(v: string): number | null | "bad" {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "bad";
}

async function done(message: string): Promise<FormState> {
  revalidatePath("/", "layout");
  return { ok: true, message, savedAt: Date.now() };
}

export async function addCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const name = str(fd, "name");
  const budget = parseBudget(str(fd, "monthly_budget"));
  if (!name) return { ok: false, message: "Enter a category name." };
  if (budget === "bad") return { ok: false, message: "Budget must be a positive number." };
  const { data: last } = await supabase
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("categories")
    .insert({ name, monthly_budget: budget, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return { ok: false, message: friendly(error) };
  return done(`Added ${name}`);
}

export async function updateCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const budget = parseBudget(str(fd, "monthly_budget"));
  if (!name) return { ok: false, message: "Name can't be empty." };
  if (budget === "bad") return { ok: false, message: "Budget must be a positive number." };
  const { error } = await supabase
    .from("categories")
    .update({ name, monthly_budget: budget })
    .eq("id", id);
  if (error) return { ok: false, message: friendly(error) };
  return done("Saved");
}

export async function setCategoryArchived(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const archived = str(fd, "archived") === "true";
  const { error } = await supabase
    .from("categories")
    .update({ is_archived: archived })
    .eq("id", str(fd, "id"));
  if (error) return { ok: false, message: friendly(error) };
  return done(archived ? "Hidden" : "Restored");
}

export async function addSubcategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const category_id = str(fd, "category_id");
  const name = str(fd, "name");
  if (!name) return { ok: false, message: "Enter a sub-category name." };
  const { data: last } = await supabase
    .from("subcategories")
    .select("sort_order")
    .eq("category_id", category_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("subcategories")
    .insert({ category_id, name, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return { ok: false, message: friendly(error) };
  return done(`Added ${name}`);
}

export async function updateSubcategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const name = str(fd, "name");
  if (!name) return { ok: false, message: "Name can't be empty." };
  const { error } = await supabase.from("subcategories").update({ name }).eq("id", str(fd, "id"));
  if (error) return { ok: false, message: friendly(error) };
  return done("Saved");
}

export async function setSubcategoryArchived(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const archived = str(fd, "archived") === "true";
  const { error } = await supabase
    .from("subcategories")
    .update({ is_archived: archived })
    .eq("id", str(fd, "id"));
  if (error) return { ok: false, message: friendly(error) };
  return done(archived ? "Hidden" : "Restored");
}
