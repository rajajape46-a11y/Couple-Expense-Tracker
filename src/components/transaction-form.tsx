"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { saveTransaction } from "@/app/actions";
import {
  EXPENSE_TYPES,
  PAYMENT_METHODS,
  type Category,
  type ExpenseType,
  type FormState,
  type MerchantMemory,
  type Person,
  type Transaction,
} from "@/lib/types";

type Props = {
  categories: Category[];
  people: Person[];
  meId: string | null;
  today: string;
  hints: {
    memory: MerchantMemory;
    subExpense: Record<string, ExpenseType>;
    topMerchants: string[];
  };
  initial?: Transaction;
};

export function TransactionForm({ categories, people, meId, today, hints, initial }: Props) {
  const editing = Boolean(initial);
  const amountRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [date, setDate] = useState(initial?.txn_date ?? today);
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategory_id ?? "");
  const [expenseType, setExpenseType] = useState<ExpenseType | "">(initial?.expense_type ?? "");
  const [expenseTouched, setExpenseTouched] = useState(editing);
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? meId ?? people[0]?.id ?? "");
  const [split, setSplit] = useState(
    initial ? (initial.split_type === "shared" ? "shared" : initial.personal_for ?? "shared") : "shared",
  );
  const [payment, setPayment] = useState(initial?.payment_method ?? "");
  const [oneOff, setOneOff] = useState(initial?.is_one_off ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [filledFrom, setFilledFrom] = useState<string | null>(null);

  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await saveTransaction(prev, fd);
    if (result?.ok) {
      // "Save & add another": keep the date and who paid; clear the rest so the
      // next expense isn't accidentally filed under the previous category.
      setAmount("");
      setMerchant("");
      setCategoryId("");
      setSubcategoryId("");
      setExpenseType("");
      setSplit("shared");
      setPayment("");
      setNotes("");
      setOneOff(false);
      setFilledFrom(null);
      setExpenseTouched(false);
      amountRef.current?.focus();
    }
    return result;
  }, null);

  const category = categories.find((c) => c.id === categoryId);
  const merchants = useMemo(
    () => Object.values(hints.memory).map((m) => m.merchant),
    [hints.memory],
  );

  function chooseCategory(id: string) {
    setCategoryId(id);
    const c = categories.find((x) => x.id === id);
    const subs = c?.subcategories ?? [];
    if (!subs.some((s) => s.id === subcategoryId)) {
      const only = subs.length === 1 ? subs[0].id : "";
      setSubcategoryId(only);
      if (only) suggestExpense(only);
    }
  }

  function suggestExpense(subId: string) {
    const guess = hints.subExpense[subId];
    if (guess && !expenseTouched) setExpenseType(guess);
  }

  function applyMemory(value: string) {
    if (editing) return;
    const m = hints.memory[value.trim().toLowerCase()];
    if (!m) {
      setFilledFrom(null);
      return;
    }
    const c = categories.find((x) => x.id === m.category_id);
    if (!c) return;
    setCategoryId(m.category_id);
    setSubcategoryId(
      m.subcategory_id && c.subcategories.some((s) => s.id === m.subcategory_id) ? m.subcategory_id : "",
    );
    setExpenseType(m.expense_type);
    setExpenseTouched(true);
    setSplit(m.split_type === "shared" ? "shared" : m.personal_for ?? "shared");
    setPayment(m.payment_method ?? "");
    setFilledFrom(m.merchant);
  }

  return (
    <form
      // Submitted manually (not via the action prop) so React doesn't wipe the
      // fields when the server returns a validation message.
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => action(fd));
      }}
      className="space-y-5 p-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="subcategory_id" value={subcategoryId} />
      <input type="hidden" name="expense_type" value={expenseType} />
      <input type="hidden" name="paid_by" value={paidBy} />
      <input type="hidden" name="split" value={split} />

      {/* Amount */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Amount
        </label>
        <div className="mt-1 flex items-center gap-1 text-4xl font-bold text-navy">
          <span className="text-muted">$</span>
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            autoFocus={!editing}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent tabular-nums outline-none placeholder:text-line"
            style={{ fontSize: "2.25rem" }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">Use a minus sign for refunds.</p>
      </div>

      {/* Merchant + date */}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Merchant / description</span>
          <input
            name="merchant"
            list="merchant-list"
            autoComplete="off"
            value={merchant}
            onChange={(e) => {
              setMerchant(e.target.value);
              applyMemory(e.target.value);
            }}
            placeholder="e.g. Coles Supermarket"
            className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 outline-none focus:border-teal"
          />
          <datalist id="merchant-list">
            {merchants.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        {!editing && hints.topMerchants.length > 0 && !merchant && (
          <div className="flex flex-wrap gap-2">
            {hints.topMerchants.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMerchant(m);
                  applyMemory(m);
                }}
                className="rounded-full border border-line px-3 py-1 text-sm text-ink active:bg-canvas"
              >
                {m}
              </button>
            ))}
          </div>
        )}
        {filledFrom && (
          <p className="rounded-lg bg-teal-soft px-3 py-2 text-xs text-teal">
            Filled in from your last &ldquo;{filledFrom}&rdquo; – change anything below if needed.
          </p>
        )}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Date</span>
          <input
            type="date"
            name="txn_date"
            value={date}
            max="2100-12-31"
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 outline-none focus:border-teal"
          />
        </label>
      </div>

      {/* Category */}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Category</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Chip key={c.id} active={c.id === categoryId} onClick={() => chooseCategory(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
        {category && (
          <>
            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Sub-category</p>
            <div className="flex flex-wrap gap-2">
              {category.subcategories.map((s) => (
                <Chip
                  key={s.id}
                  tone="teal"
                  active={s.id === subcategoryId}
                  onClick={() => {
                    setSubcategoryId(s.id);
                    suggestExpense(s.id);
                  }}
                >
                  {s.name}
                </Chip>
              ))}
              {category.subcategories.length === 0 && (
                <p className="text-sm text-muted">No sub-categories yet – add some in Settings.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Type, payer, split */}
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <Segmented
          label="Expense type"
          value={expenseType}
          options={EXPENSE_TYPES.map((t) => ({ value: t, label: t }))}
          onChange={(v) => {
            setExpenseType(v as ExpenseType);
            setExpenseTouched(true);
          }}
        />
        <Segmented
          label="Paid by"
          value={paidBy}
          options={people.map((p) => ({ value: p.id, label: p.name }))}
          onChange={setPaidBy}
        />
        <Segmented
          label="Split"
          value={split}
          options={[
            { value: "shared", label: "Shared 50/50" },
            ...people.map((p) => ({ value: p.id, label: `${p.name} only` })),
          ]}
          onChange={setSplit}
        />
      </div>

      {/* Extras */}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Payment method (optional)</span>
          <select
            name="payment_method"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-teal"
          >
            <option value="">—</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-medium">One-off cost</span>
            <span className="block text-xs text-muted">e.g. bond, tuition – can be hidden from monthly trends</span>
          </span>
          <input
            type="checkbox"
            name="is_one_off"
            checked={oneOff}
            onChange={(e) => setOneOff(e.target.checked)}
            className="h-6 w-6 accent-teal"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Notes (optional)</span>
          <textarea
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 outline-none focus:border-teal"
          />
        </label>
      </div>

      {state && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            state.ok ? "bg-teal-soft text-teal" : "bg-red-50 text-coral"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="sticky bottom-24 flex gap-3">
        {editing ? (
          <ActionButton pending={pending} primary>
            Save changes
          </ActionButton>
        ) : (
          <>
            <ActionButton pending={pending} name="intent" value="again">
              Save &amp; add another
            </ActionButton>
            <ActionButton pending={pending} name="intent" value="done" primary>
              Save
            </ActionButton>
          </>
        )}
      </div>
    </form>
  );
}

function ActionButton({
  pending,
  primary = false,
  name,
  value,
  children,
}: {
  pending: boolean;
  primary?: boolean;
  name?: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`flex-1 rounded-xl px-4 py-3 font-semibold shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${
        primary ? "bg-navy text-white" : "border border-navy bg-white text-navy"
      }`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
  tone = "navy",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "navy" | "teal";
}) {
  const on = tone === "navy" ? "border-navy bg-navy text-white" : "border-teal bg-teal text-white";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active ? on : "border-line bg-white text-ink active:bg-canvas"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex rounded-xl bg-canvas p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition ${
              value === o.value ? "bg-white text-navy shadow-sm" : "text-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
