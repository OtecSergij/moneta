import { formatShortDate } from "@/lib/dates";

// Subtitle shared by expense rows (home list + summary bar details):
// "17.05.2026" or "17.05.2026 · Магнит".
export function expenseSubtitle(spentAt: string, note: string | null): string {
  const date = formatShortDate(spentAt);
  return note ? `${date} · ${note}` : date;
}
