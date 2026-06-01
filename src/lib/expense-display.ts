import { formatRelativeDay } from "@/lib/dates";

// Subtitle shared by expense rows (home list + summary bar details):
// "Сегодня", "Вторник · Магнит", "1 июня · Магнит" (see formatRelativeDay).
export function expenseSubtitle(spentAt: string, note: string | null): string {
  const date = formatRelativeDay(spentAt);
  return note ? `${date} · ${note}` : date;
}
