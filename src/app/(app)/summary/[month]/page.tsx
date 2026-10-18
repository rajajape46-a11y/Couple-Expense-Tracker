import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TxnRow } from "@/components/txn-row";
import { getCategories, getContext, getMonthlyTotals, getTransactions } from "@/lib/data";
import { isMonth, money, money0, monthLabel, monthRange, shiftMonth, thisMonth, todayISO } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/summary/[month]">): Promise<Metadata> {
  const { month } = await params;
  return { title: isMonth(month) ? monthLabel(month) : "Summary" };
}

export default async function MonthSummaryPage({ params }: PageProps<"/summary/[month]">) {
  const { month } = await params;
  if (!isMonth(month)) notFound();
  const current = thisMonth();
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const { from, to } = monthRange(month);

  const { people } = await getContext();
  const [txns, categories, prevTotals] = await Promise.all([
    getTransactions({ from, to }),
    getCategories(true),
    getMonthlyTotals(monthRange(prev).from, monthRange(prev).to),
  ]);

  const sum = (xs: { amount: number }[]) => xs.reduce((s, t) => s + t.amount, 0);
  const total = sum(txns);
  const oneOff = sum(txns.filter((t) => t.is_one_off));
  const fixed = sum(txns.filter((t) => t.expense_type === "Fixed Needs"));
  const variable = total - fixed;
  const prevTotal = prevTotals.reduce((s, t) => s + t.total, 0);
  const change = prevTotal ? total / prevTotal - 1 : null;
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = month === current ? Number(todayISO().slice(8, 10)) : daysInMonth;

  // category → { spent, subs }
  const byCat = new Map<string, { spent: number; subs: Map<string, number> }>();
  for (const t of txns) {
    const c = byCat.get(t.category_id) ?? { spent: 0, subs: new Map<string, number>() };
    c.spent += t.amount;
    const sk = t.subcategory_id ?? "";
    c.subs.set(sk, (c.subs.get(sk) ?? 0) + t.amount);
    byCat.set(t.category_id, c);
  }
  const subName = new Map(categories.flatMap((c) => c.subcategories.map((s) => [s.id, s.name])));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const catRows = categories
    .map((c) => ({ c, d: byCat.get(c.id) }))
    .filter(({ c, d }) => d || (!c.is_archived && (c.monthly_budget ?? 0) > 0))
    .sort((a, b) => (b.d?.spent ?? 0) - (a.d?.spent ?? 0));
  const budgetTotal = catRows.reduce((s, { c }) => s + (c.monthly_budget ?? 0), 0);
  const maxBar = Math.max(1, ...catRows.map(({ c, d }) => Math.max(d?.spent ?? 0, c.monthly_budget ?? 0)));

  const top = [...txns].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const paidBy = people.map((p) => ({ p, paid: sum(txns.filter((t) => t.paid_by === p.id)) }));

  return (
    <main>
      <PageHeader
        title={monthLabel(month)}
        subtitle="Monthly summary"
        right={
          <Link href={`/summary?year=${y}`} className="flex items-center text-sm text-white/80">
            <ChevronLeft size={18} /> Year
          </Link>
        }
      />

      <div className="flex items-center justify-between px-4 pt-4">
        <Link href={`/summary/${prev}`} aria-label="Previous month" className="rounded-full bg-white p-2 shadow-sm">
          <ChevronLeft size={20} />
        </Link>
        <Link href={`/transactions?month=${month}`} className="text-sm font-medium text-teal">
          See all {txns.length} expenses
        </Link>
        {next <= current ? (
          <Link href={`/summary/${next}`} aria-label="Next month" className="rounded-full bg-white p-2 shadow-sm">
            <ChevronRight size={20} />
          </Link>
        ) : (
          <span className="w-9" />
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 p-4">
        <div className="col-span-2 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total spent</p>
          <p className="mt-1 text-3xl font-bold text-navy tabular-nums">{money(total)}</p>
          <p className="mt-1 text-xs text-muted">
            {txns.length} transactions
            {oneOff !== 0 && <> · {money0(total - oneOff)} excluding one-offs</>}
            {budgetTotal > 0 && <> · budget {money0(budgetTotal)}</>}
          </p>
        </div>
        <Tile
          label="Vs previous month"
          value={change === null ? "–" : `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`}
          note={prevTotal ? `${monthLabel(prev)}: ${money0(prevTotal)}` : "No data last month"}
          tone={change === null ? "" : change > 0 ? "text-coral" : "text-teal"}
        />
        <Tile label="Daily average" value={money0(total / Math.max(days, 1))} note={`over ${days} days`} />
        <Tile label="Fixed needs" value={money0(fixed)} note={total ? `${Math.round((fixed / total) * 100)}% of spend` : ""} />
        <Tile label="Variable wants" value={money0(variable)} note={total ? `${Math.round((variable / total) * 100)}% of spend` : ""} />
      </section>

      <section className="mx-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-navy">Categories</h2>
        <p className="mb-3 text-xs text-muted">Tap a category for its sub-categories · amber line = budget</p>
        {catRows.length === 0 && <p className="text-sm text-muted">Nothing logged this month.</p>}
        <ul className="space-y-2">
          {catRows.map(({ c, d }) => {
            const spent = d?.spent ?? 0;
            const budget = c.monthly_budget ?? 0;
            const over = budget > 0 && spent > budget;
            const subs = d ? [...d.subs.entries()].sort((a, b) => b[1] - a[1]) : [];
            return (
              <li key={c.id}>
                <details>
                  <summary className="cursor-pointer list-none">
                    <div className="flex justify-between text-sm">
                      <span>{c.name}</span>
                      <span className={`tabular-nums ${over ? "font-semibold text-coral" : ""}`}>
                        {money0(spent)}
                        {budget > 0 && <span className="text-muted"> / {money0(budget)}</span>}
                        {total > 0 && <span className="ml-1 text-xs text-muted">{Math.round((spent / total) * 100)}%</span>}
                      </span>
                    </div>
                    <div className="relative mt-1 h-2 rounded-full bg-canvas">
                      <div
                        className={`h-2 rounded-full ${over ? "bg-coral" : "bg-navy"}`}
                        style={{ width: `${Math.max(0, (spent / maxBar) * 100)}%` }}
                      />
                      {budget > 0 && (
                        <div className="absolute -top-0.5 h-3 w-0.5 bg-amber" style={{ left: `${(budget / maxBar) * 100}%` }} />
                      )}
                    </div>
                  </summary>
                  <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-sm text-muted">
                    {subs.map(([sid, amt]) => (
                      <li key={sid} className="flex justify-between">
                        <span>{sid ? subName.get(sid) : "No sub-category"}</span>
                        <span className="tabular-nums">{money0(amt)}</span>
                      </li>
                    ))}
                    {subs.length === 0 && <li>No spending yet</li>}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      {top.length > 0 && (
        <section className="m-4 overflow-hidden rounded-2xl bg-white shadow-sm">
          <h2 className="px-4 pt-4 font-semibold text-navy">Biggest expenses</h2>
          <ul className="divide-y divide-line">
            {top.map((t) => (
              <TxnRow
                key={t.id}
                t={t}
                people={people}
                categoryName={catName.get(t.category_id) ?? ""}
                subcategoryName={t.subcategory_id ? subName.get(t.subcategory_id) : undefined}
              />
            ))}
          </ul>
        </section>
      )}

      {total !== 0 && (
        <section className="m-4 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-navy">Who paid</h2>
          <ul className="mt-3 space-y-3">
            {paidBy.map(({ p, paid }) => (
              <li key={p.id}>
                <div className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="tabular-nums">
                    {money0(paid)} <span className="text-xs text-muted">{Math.round((paid / total) * 100)}%</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-canvas">
                  <div className="h-2 rounded-full bg-teal" style={{ width: `${Math.max(0, (paid / total) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Tile({ label, value, note, tone = "" }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone || "text-navy"}`}>{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
