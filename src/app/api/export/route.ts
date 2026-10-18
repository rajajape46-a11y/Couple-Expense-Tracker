import { getCategories, getContext, getTransactions } from "@/lib/data";
import { buildWorkbook, type ExportRow } from "@/lib/excel/export";
import { todayISO } from "@/lib/format";

/** Downloads every expense as an .xlsx in the "Monthly expense log v2" layout. */
export async function GET() {
  const { people } = await getContext();
  const [txns, categories] = await Promise.all([
    getTransactions({ ascending: true }),
    getCategories(true),
  ]);

  const personName = new Map(people.map((p) => [p.id, p.name]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const subName = new Map(categories.flatMap((c) => c.subcategories.map((s) => [s.id, s.name])));

  const rows: ExportRow[] = txns.map((t) => ({
    date: t.txn_date,
    merchant: t.merchant,
    category: catName.get(t.category_id) ?? "",
    subcategory: t.subcategory_id ? (subName.get(t.subcategory_id) ?? "") : "",
    expenseType: t.expense_type,
    paidBy: personName.get(t.paid_by) ?? "",
    split:
      t.split_type === "shared" ? "Shared (50/50)" : `${personName.get(t.personal_for ?? "") ?? ""} only`,
    paymentMethod: t.payment_method ?? "",
    amount: t.amount,
    oneOff: t.is_one_off,
    notes: t.notes ?? "",
  }));

  // Active categories first (they drive the dropdowns), hidden ones after.
  const ordered = [...categories.filter((c) => !c.is_archived), ...categories.filter((c) => c.is_archived)];
  try {
    const file = await buildWorkbook({
      people: [...people].sort((a, b) => a.sort_order - b.sort_order).map((p) => p.name),
      categories: ordered.map((c) => ({
        name: c.name,
        budget: c.monthly_budget,
        subcategories: c.subcategories.map((s) => s.name),
      })),
      rows,
    });
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Monthly expense log ${todayISO()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
}
