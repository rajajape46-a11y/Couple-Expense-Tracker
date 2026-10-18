import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { deleteRecurring } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { getCategories, getContext, getEntryHints, getRecurringRule } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { occurrence } from "@/lib/recurring";
import { ConfirmButton } from "@/components/confirm-button";

export const metadata: Metadata = { title: "Edit recurring expense" };

export default async function EditRecurringPage({ params }: PageProps<"/settings/recurring/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { people, me } = await getContext();
  const [rule, categories, hints] = await Promise.all([getRecurringRule(id), getCategories(true), getEntryHints()]);
  if (!rule) notFound();

  const visible = categories
    .filter((c) => !c.is_archived || c.id === rule.category_id)
    .map((c) => ({
      ...c,
      subcategories: c.subcategories.filter((s) => !s.is_archived || s.id === rule.subcategory_id),
    }));

  return (
    <main>
      <PageHeader
        title="Edit recurring expense"
        right={
          <Link href="/settings/recurring" className="flex items-center text-sm text-white/80">
            <ChevronLeft size={18} /> Back
          </Link>
        }
      />
      <TransactionForm
        categories={visible}
        people={people}
        meId={me?.id ?? null}
        today={todayISO()}
        hints={hints}
        initial={{
          ...rule,
          txn_date: occurrence(rule.start_date, rule.frequency, rule.next_index),
          recurring_rule_id: null,
        }}
        recurring={{ id: rule.id, frequency: rule.frequency, endDate: rule.end_date }}
      />
      <form action={deleteRecurring} className="px-4 pb-4">
        <input type="hidden" name="id" value={rule.id} />
        <ConfirmButton message="Delete this recurring expense? Expenses it already created are kept.">
          Delete recurring expense
        </ConfirmButton>
      </form>
    </main>
  );
}
