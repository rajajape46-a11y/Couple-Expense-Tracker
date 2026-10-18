import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { deleteTransaction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { DeleteButton } from "./delete-button";
import { getCategories, getContext, getEntryHints, getTransaction } from "@/lib/data";
import { todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditPage({ params }: PageProps<"/transactions/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { people, me } = await getContext();
  const [txn, categories, hints] = await Promise.all([
    getTransaction(id),
    getCategories(true),
    getEntryHints(),
  ]);
  if (!txn) notFound();

  // Keep archived items visible if this transaction still uses them.
  const visible = categories
    .filter((c) => !c.is_archived || c.id === txn.category_id)
    .map((c) => ({
      ...c,
      subcategories: c.subcategories.filter((s) => !s.is_archived || s.id === txn.subcategory_id),
    }));

  const month = txn.txn_date.slice(0, 7);
  return (
    <main>
      <PageHeader
        title="Edit expense"
        right={
          <Link href={`/transactions?month=${month}`} className="flex items-center text-sm text-white/80">
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
        initial={txn}
      />
      <form action={deleteTransaction} className="px-4 pb-4">
        <input type="hidden" name="id" value={txn.id} />
        <input type="hidden" name="month" value={month} />
        <DeleteButton />
      </form>
    </main>
  );
}
