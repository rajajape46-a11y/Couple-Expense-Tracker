import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TxnRow } from "@/components/txn-row";
import { getCategories, getContext, getTransactions } from "@/lib/data";
import {
  dayLabel,
  isMonth,
  money,
  monthLabel,
  monthRange,
  shiftMonth,
  thisMonth,
} from "@/lib/format";
import type { Transaction } from "@/lib/types";

export const metadata: Metadata = { title: "Expenses" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const month = isMonth(one(sp.month)) ? one(sp.month) : thisMonth();
  const q = one(sp.q).trim();
  const cat = one(sp.cat);

  const { people } = await getContext();
  const { from, to } = monthRange(month);
  const [txns, categories] = await Promise.all([
    getTransactions({ from, to, q: q || undefined, categoryId: cat || undefined }),
    getCategories(true),
  ]);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const subName = new Map(categories.flatMap((c) => c.subcategories.map((s) => [s.id, s.name])));
  const total = txns.reduce((s, t) => s + t.amount, 0);

  const groups = new Map<string, Transaction[]>();
  for (const t of txns) groups.set(t.txn_date, [...(groups.get(t.txn_date) ?? []), t]);

  const link = (m: string) => {
    const p = new URLSearchParams({ month: m });
    if (q) p.set("q", q);
    if (cat) p.set("cat", cat);
    return `/transactions?${p}`;
  };

  return (
    <main>
      <PageHeader
        title="Expenses"
        subtitle={`${txns.length} transactions · ${money(total)}`}
      />

      <div className="flex items-center justify-between px-4 pt-4">
        <Link href={link(shiftMonth(month, -1))} aria-label="Previous month" className="rounded-full bg-white p-2 shadow-sm">
          <ChevronLeft size={20} />
        </Link>
        <p className="font-semibold text-navy">{monthLabel(month)}</p>
        <Link href={link(shiftMonth(month, 1))} aria-label="Next month" className="rounded-full bg-white p-2 shadow-sm">
          <ChevronRight size={20} />
        </Link>
      </div>

      <form className="flex gap-2 px-4 pt-3" action="/transactions">
        <input type="hidden" name="month" value={month} />
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search merchant"
            className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 outline-none focus:border-teal"
          />
        </div>
        <select
          name="cat"
          defaultValue={cat}
          className="w-36 rounded-xl border border-line bg-white px-2 py-2 outline-none focus:border-teal"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="rounded-xl bg-navy px-3 text-sm font-semibold text-white">Go</button>
      </form>

      {txns.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted">
          Nothing found for {monthLabel(month)}.
        </p>
      )}

      {[...groups.entries()].map(([day, rows]) => (
        <section key={day} className="mx-4 mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="flex justify-between bg-canvas/60 px-4 py-2 text-xs font-semibold text-muted">
            <span>{dayLabel(day)}</span>
            <span className="tabular-nums">{money(rows.reduce((s, t) => s + t.amount, 0))}</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((t) => (
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
      ))}
    </main>
  );
}
