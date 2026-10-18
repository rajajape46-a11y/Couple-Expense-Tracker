import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { getCategories, getContext, getEntryHints, getTransaction } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { occurrence } from "@/lib/recurring";

export const metadata: Metadata = { title: "New recurring expense" };

export default async function NewRecurringPage({ searchParams }: PageProps<"/settings/recurring/new">) {
  const sp = await searchParams;
  const from = typeof sp.from === "string" && /^[0-9a-f-]{36}$/i.test(sp.from) ? sp.from : null;
  const { people, me } = await getContext();
  const [categories, hints, source] = await Promise.all([
    getCategories(),
    getEntryHints(),
    from ? getTransaction(from) : Promise.resolve(null),
  ]);
  // Starting from an existing expense: repeat it from next month.
  const initial = source
    ? { ...source, id: "", txn_date: occurrence(source.txn_date, "monthly", 1), recurring_rule_id: null }
    : undefined;

  return (
    <main>
      <PageHeader
        title="New recurring expense"
        right={
          <Link href="/settings/recurring" className="flex items-center text-sm text-white/80">
            <ChevronLeft size={18} /> Back
          </Link>
        }
      />
      <TransactionForm
        categories={categories}
        people={people}
        meId={me?.id ?? null}
        today={todayISO()}
        hints={hints}
        initial={initial}
        recurring={{ frequency: "monthly", endDate: null }}
      />
    </main>
  );
}
