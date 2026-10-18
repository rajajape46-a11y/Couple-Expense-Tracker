import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getCategories, getFirstMonth, getMonthlyTotals } from "@/lib/data";
import { money0, thisMonth } from "@/lib/format";

export const metadata: Metadata = { title: "Monthly summary" };

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function SummaryPage({ searchParams }: PageProps<"/summary">) {
  const sp = await searchParams;
  const current = thisMonth();
  const currentYear = Number(current.slice(0, 4));
  const yearParam = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : currentYear;
  const year = Math.min(yearParam, currentYear);

  const [firstMonth, totals, categories] = await Promise.all([
    getFirstMonth(),
    getMonthlyTotals(`${year}-01-01`, `${year + 1}-01-01`),
    getCategories(true),
  ]);

  // Months shown: from the first month with data (or January) up to now (or December).
  const months: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    if (key > current) break;
    if (firstMonth && key < firstMonth) continue;
    months.push(key);
  }

  const cell = new Map<string, number>(); // category|month -> total
  const monthTotal = new Map<string, number>();
  const monthOneOff = new Map<string, number>();
  const catTotal = new Map<string, number>();
  for (const t of totals) {
    cell.set(`${t.category_id}|${t.month}`, t.total);
    monthTotal.set(t.month, (monthTotal.get(t.month) ?? 0) + t.total);
    monthOneOff.set(t.month, (monthOneOff.get(t.month) ?? 0) + t.one_off);
    catTotal.set(t.category_id, (catTotal.get(t.category_id) ?? 0) + t.total);
  }
  const rows = categories.filter((c) => !c.is_archived || catTotal.has(c.id));
  const yearTotal = [...monthTotal.values()].reduce((a, b) => a + b, 0);
  const yearOneOff = [...monthOneOff.values()].reduce((a, b) => a + b, 0);
  const n = Math.max(months.length, 1);
  const firstYear = firstMonth ? Number(firstMonth.slice(0, 4)) : currentYear;

  const fmt = (v: number | undefined) => (v ? money0(v) : "–");
  const th = "sticky left-0 z-[1] bg-white px-3 py-2 text-left";

  return (
    <main>
      <PageHeader title="Monthly summary" subtitle="Spend by category and month" />

      <div className="flex items-center justify-between px-4 pt-4">
        {year > firstYear ? (
          <Link href={`/summary?year=${year - 1}`} aria-label="Previous year" className="rounded-full bg-white p-2 shadow-sm">
            <ChevronLeft size={20} />
          </Link>
        ) : (
          <span className="w-9" />
        )}
        <p className="font-semibold text-navy">{year}</p>
        {year < currentYear ? (
          <Link href={`/summary?year=${year + 1}`} aria-label="Next year" className="rounded-full bg-white p-2 shadow-sm">
            <ChevronRight size={20} />
          </Link>
        ) : (
          <span className="w-9" />
        )}
      </div>

      {months.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">No expenses in {year}.</p>
      ) : (
        <>
          <div className="mx-4 mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label={`Total ${year}`} value={money0(yearTotal)} />
            <Stat label="Avg / month" value={money0(yearTotal / n)} />
            <Stat label="Excl. one-offs" value={money0(yearTotal - yearOneOff)} />
          </div>

          <p className="px-4 pt-3 text-xs text-muted">Tap a month for its full summary. Swipe sideways to see all months.</p>
          <div className="mx-4 mt-2 overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-max min-w-full border-collapse text-sm tabular-nums" data-testid="summary-grid">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className={th}>Category</th>
                  {months.map((m) => (
                    <th key={m} className="px-3 py-2 text-right">
                      <Link href={`/summary/${m}`} className="font-semibold text-teal underline-offset-2 hover:underline">
                        {SHORT[Number(m.slice(5)) - 1]}
                      </Link>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Avg</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className={`${th} max-w-40 truncate font-medium text-ink`}>{c.name}</td>
                    {months.map((m) => (
                      <td key={m} className="px-3 py-2 text-right">
                        {fmt(cell.get(`${c.id}|${m}`))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold">{fmt(catTotal.get(c.id))}</td>
                    <td className="px-3 py-2 text-right text-muted">{fmt((catTotal.get(c.id) ?? 0) / n)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-canvas font-semibold text-navy">
                  <td className={`${th} bg-canvas`}>Total spent</td>
                  {months.map((m) => (
                    <td key={m} className="px-3 py-2 text-right">{fmt(monthTotal.get(m))}</td>
                  ))}
                  <td className="px-3 py-2 text-right">{money0(yearTotal)}</td>
                  <td className="px-3 py-2 text-right">{money0(yearTotal / n)}</td>
                </tr>
                <tr className="text-xs text-muted">
                  <td className={th}>of which one-off</td>
                  {months.map((m) => (
                    <td key={m} className="px-3 py-1.5 text-right">{fmt(monthOneOff.get(m))}</td>
                  ))}
                  <td className="px-3 py-1.5 text-right">{fmt(yearOneOff)}</td>
                  <td />
                </tr>
                <tr className="text-xs text-muted">
                  <td className={th}>excluding one-off</td>
                  {months.map((m) => (
                    <td key={m} className="px-3 py-1.5 text-right">
                      {fmt((monthTotal.get(m) ?? 0) - (monthOneOff.get(m) ?? 0))}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right">{fmt(yearTotal - yearOneOff)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt((yearTotal - yearOneOff) / n)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-navy tabular-nums">{value}</p>
    </div>
  );
}
