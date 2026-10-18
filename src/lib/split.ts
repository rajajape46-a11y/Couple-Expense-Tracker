import type { Person, Transaction } from "./types";

type Row = Pick<Transaction, "amount" | "paid_by" | "split_type" | "personal_for">;

export type Balance = { person: Person; paid: number; share: number; net: number };

/**
 * How much each person paid vs. how much of the spending is theirs.
 * Shared rows are split equally; personal rows belong to `personal_for`.
 * net > 0 means the others owe this person money.
 */
export function balances(rows: Row[], people: Person[]): Balance[] {
  const map = new Map<string, Balance>(
    people.map((p) => [p.id, { person: p, paid: 0, share: 0, net: 0 }]),
  );
  const n = Math.max(people.length, 1);
  for (const r of rows) {
    const payer = map.get(r.paid_by);
    if (payer) payer.paid += r.amount;
    if (r.split_type === "personal" && r.personal_for) {
      const owner = map.get(r.personal_for);
      if (owner) owner.share += r.amount;
    } else {
      for (const b of map.values()) b.share += r.amount / n;
    }
  }
  for (const b of map.values()) b.net = round2(b.paid - b.share);
  return [...map.values()];
}

/** "Jo owes Raja $5,928.05" style sentence for two people. */
export function settleSentence(bs: Balance[], fmt: (n: number) => string): string {
  if (bs.length < 2) return "Add a second person to see who owes whom.";
  const [a, b] = bs;
  if (Math.abs(a.net) < 0.005) return "All square – nobody owes anything";
  return a.net > 0
    ? `${b.person.name} owes ${a.person.name} ${fmt(a.net)}`
    : `${a.person.name} owes ${b.person.name} ${fmt(-a.net)}`;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
