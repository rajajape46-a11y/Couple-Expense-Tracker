import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TxnRow } from "@/components/txn-row";
import { catchUpRecurring, getCategories, getContext, getTransactions } from "@/lib/data";
import { monthLabel, monthRange, money, money0, thisMonth } from "@/lib/format";

export default async function HomePage() {
  const month = thisMonth();
  const { from, to } = monthRange(month);
  const { people, me } = await getContext();
  await catchUpRecurring();
  const [txns, categories] = await Promise.all([getTransactions({ from, to }), getCategories(true)]);

  const total = txns.reduce((s, t) => s + t.amount, 0);
  const oneOff = txns.filter((t) => t.is_one_off).reduce((s, t) => s + t.amount, 0);
  const fixed = txns.filter((t) => t.expense_type === "Fixed Needs").reduce((s, t) => s + t.amount, 0);
  const variable = total - fixed;

  const byCat = new Map<string, number>();
  for (const t of txns) byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + t.amount);
  const catRows = categories
    .map((c) => ({ c, spent: byCat.get(c.id) ?? 0 }))
    .filter((r) => r.spent !== 0 || (r.c.monthly_budget ?? 0) > 0)
    .sort((a, b) => b.spent - a.spent);
  const maxSpent = Math.max(1, ...catRows.map((r) => Math.max(r.spent, r.c.monthly_budget ?? 0)));

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const subName = new Map(categories.flatMap((c) => c.subcategories.map((s) => [s.id, s.name])));

  return (
    <main>
      <PageHeader
        brand
        title="Couple Expense Tracker"
        subtitle={`Hi ${me?.name ?? "there"} · ${monthLabel(month)}`}
      />

      <section className="grid grid-cols-2 gap-3 p-4">
        <div className="col-span-2 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Spent this month</p>
          <p className="mt-1 text-3xl font-bold text-navy tabular-nums">{money(total)}</p>
          <p className="mt-1 text-xs text-muted">
            {txns.length} transactions
            {oneOff !== 0 && <> · {money0(total - oneOff)} excluding one-offs</>}
          </p>
        </div>
        <Stat label="Fixed needs" value={money0(fixed)} pct={total ? fixed / total : 0} />
        <Stat label="Variable wants" value={money0(variable)} pct={total ? variable / total : 0} />
      </section>

      <section className="m-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold text-navy">By category</h2>
          <Link href={`/summary/${month}`} className="text-sm font-medium text-teal">
            Month summary
          </Link>
        </div>
        {catRows.length === 0 && <p className="text-sm text-muted">Nothing logged this month yet.</p>}
        {catRows.length > 0 && <p className="mb-3 text-xs text-muted">Bar = spent · amber line = monthly budget</p>}
        <ul className="space-y-3">
          {catRows.map(({ c, spent }) => {
            const budget = c.monthly_budget ?? 0;
            const over = budget > 0 && spent > budget;
            return (
              <li key={c.id}>
                <div className="flex justify-between text-sm">
                  <span>{c.name}</span>
                  <span className={`tabular-nums ${over ? "font-semibold text-coral" : ""}`}>
                    {money0(spent)}
                    {budget > 0 && <span className="text-muted"> / {money0(budget)}</span>}
                  </span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-canvas">
                  <div
                    className={`h-2 rounded-full ${over ? "bg-coral" : "bg-navy"}`}
                    style={{ width: `${Math.max(0, (spent / maxSpent) * 100)}%` }}
                  />
                  {budget > 0 && (
                    <div
                      className="absolute -top-0.5 h-3 w-0.5 bg-amber"
                      style={{ left: `${(budget / maxSpent) * 100}%` }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="m-4 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-baseline justify-between px-4 pt-4">
          <h2 className="font-semibold text-navy">Recent</h2>
          <Link href="/transactions" className="text-sm font-medium text-teal">
            See all
          </Link>
        </div>
        <ul className="divide-y divide-line">
          {txns.slice(0, 6).map((t) => (
            <TxnRow
              key={t.id}
              t={t}
              people={people}
              categoryName={catName.get(t.category_id) ?? ""}
              subcategoryName={t.subcategory_id ? subName.get(t.subcategory_id) : undefined}
            />
          ))}
        </ul>
        {txns.length === 0 && (
          <p className="px-4 pb-4 pt-2 text-sm text-muted">
            No expenses this month.{" "}
            <Link href="/add" className="font-medium text-teal">
              Add one
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-navy tabular-nums">{value}</p>
      <p className="text-xs text-muted">{Math.round(pct * 100)}% of spend</p>
    </div>
  );
}
