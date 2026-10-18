import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { getCategories, getContext, getEntryHints } from "@/lib/data";
import { todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Add expense" };

export default async function AddPage() {
  const { people, me } = await getContext();
  const [categories, hints] = await Promise.all([getCategories(), getEntryHints()]);
  return (
    <main>
      <PageHeader title="Add expense" />
      <TransactionForm
        categories={categories}
        people={people}
        meId={me?.id ?? null}
        today={todayISO()}
        hints={hints}
      />
    </main>
  );
}
