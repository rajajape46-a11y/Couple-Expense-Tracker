export const EXPENSE_TYPES = ["Fixed Needs", "Variable Wants"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const PAYMENT_METHODS = ["Card", "Cash", "Bank Transfer", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Person = {
  id: string;
  name: string;
  user_id: string | null;
  sort_order: number;
};

export type Subcategory = {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  is_archived: boolean;
};

export type Category = {
  id: string;
  name: string;
  monthly_budget: number | null;
  sort_order: number;
  is_archived: boolean;
  subcategories: Subcategory[];
};

export type Transaction = {
  id: string;
  txn_date: string; // YYYY-MM-DD
  merchant: string;
  category_id: string;
  subcategory_id: string | null;
  expense_type: ExpenseType;
  paid_by: string;
  split_type: "shared" | "personal";
  personal_for: string | null;
  payment_method: PaymentMethod | null;
  amount: number;
  is_one_off: boolean;
  notes: string | null;
};

/** Defaults remembered from the most recent use of a merchant. */
export type MerchantMemory = Record<
  string, // merchant, lower-cased
  {
    merchant: string;
    category_id: string;
    subcategory_id: string | null;
    expense_type: ExpenseType;
    split_type: "shared" | "personal";
    personal_for: string | null;
    payment_method: PaymentMethod | null;
    count: number;
  }
>;

export type FormState = { ok: boolean; message: string; savedAt?: number } | null;
