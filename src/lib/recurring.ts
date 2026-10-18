import type { Frequency } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Date of occurrence k (0 = start date). Mirrors public.rule_occurrence in the
 * database: monthly/yearly count calendar months from the start date, so the
 * 31st becomes the last day of shorter months and returns to the 31st after.
 */
export function occurrence(start: string, frequency: Frequency, k: number): string {
  const [y, m, d] = start.split("-").map(Number);
  if (frequency === "weekly" || frequency === "fortnightly") {
    const days = (frequency === "weekly" ? 7 : 14) * k;
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  const months = frequency === "monthly" ? k : 12 * k;
  const total = m - 1 + months;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
}

/** Next date the rule will create an expense, or null if it has finished. */
export function nextDate(rule: {
  start_date: string;
  frequency: Frequency;
  next_index: number;
  end_date: string | null;
}): string | null {
  const d = occurrence(rule.start_date, rule.frequency, rule.next_index);
  return rule.end_date && d > rule.end_date ? null : d;
}
