import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Plus, Repeat } from "lucide-react";
import { setRecurringActive } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { getCategories, getContext, getRecurringRules } from "@/lib/data";
import { dayLabel, money } from "@/lib/format";
import { nextDate } from "@/lib/recurring";
import { FREQUENCY_LABEL } from "@/lib/types";

export const metadata: Metadata = { title: "Recurring expenses" };

export default async function RecurringPage() {
  const { people } = await getContext();
  const [rules, categories] = await Promise.all([getRecurringRules(), getCategories(true)]);
  const subName = new Map(categories.flatMap((c) => c.subcategories.map((s) => [s.id, s.name])));
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <main>
      <PageHeader
        title="Recurring expenses"
        right={
          <Link href="/settings" className="flex items-center text-sm text-white/80">
            <ChevronLeft size={18} /> Settings
          </Link>
        }
      />
      <p className="px-4 pt-4 text-sm text-muted">
        These are added automatically on their due date (around 6am Melbourne time), and when the app is
        opened if anything is overdue.
      </p>

      <Link
        href="/settings/recurring/new"
        className="mx-4 mt-3 flex items-center justify-center gap-2 rounded-xl bg-teal px-4 py-3 font-semibold text-white"
      >
        <Plus size={18} /> Add recurring expense
      </Link>

      {rules.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted">
          No recurring expenses yet. Add rent, phone plans or insurance here, or choose{" "}
          <em>Repeat</em> when adding an expense.
        </p>
      )}

      <ul className="m-4 space-y-3">
        {rules.map((r) => {
          const next = nextDate(r);
          const payer = people.find((p) => p.id === r.paid_by)?.name;
          return (
            <li key={r.id} className={`rounded-2xl bg-white p-4 shadow-sm ${r.is_active ? "" : "opacity-60"}`}>
              <Link href={`/settings/recurring/${r.id}`} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium">
                    <Repeat size={14} className="text-teal" /> {r.merchant}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {r.subcategory_id ? subName.get(r.subcategory_id) : catName.get(r.category_id)} · {payer} pays
                  </p>
                  <p className="mt-1 text-xs">
                    {FREQUENCY_LABEL[r.frequency]} ·{" "}
                    {!r.is_active ? "Paused" : next ? `Next: ${dayLabel(next)}` : "Finished"}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{money(r.amount)}</span>
              </Link>
              <form action={setRecurringActive} className="mt-3">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="active" value={String(!r.is_active)} />
                <button className="w-full rounded-lg bg-canvas px-3 py-2 text-sm font-medium text-muted">
                  {r.is_active ? "Pause" : "Resume"}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
