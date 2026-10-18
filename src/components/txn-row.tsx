import Link from "next/link";
import { money } from "@/lib/format";
import type { Person, Transaction } from "@/lib/types";

export function TxnRow({
  t,
  categoryName,
  subcategoryName,
  people,
}: {
  t: Transaction;
  categoryName: string;
  subcategoryName?: string;
  people: Person[];
}) {
  const payer = people.find((p) => p.id === t.paid_by)?.name ?? "?";
  const owner = t.personal_for ? people.find((p) => p.id === t.personal_for)?.name : null;
  return (
    <li>
      <Link
        href={`/transactions/${t.id}`}
        className="flex items-center gap-3 px-4 py-3 active:bg-canvas"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{t.merchant}</p>
          <p className="truncate text-xs text-muted">
            {subcategoryName ?? categoryName} · {payer} paid
            {owner ? ` · ${owner} only` : " · shared"}
            {t.is_one_off && <span className="ml-1 rounded bg-amber/20 px-1 text-[10px] font-semibold text-amber">ONE-OFF</span>}
            {t.recurring_rule_id && (
              <span className="ml-1 rounded bg-teal-soft px-1 text-[10px] font-semibold text-teal">RECURRING</span>
            )}
          </p>
        </div>
        <span className={`shrink-0 font-semibold tabular-nums ${t.amount < 0 ? "text-teal" : ""}`}>
          {money(t.amount)}
        </span>
      </Link>
    </li>
  );
}
