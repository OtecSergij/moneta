import type { ExpenseCategory } from "@/repositories/categories";
import type { ExpenseEntry } from "@/lib/expense-entry";
import { ListRow } from "@/components/kit/list-row";
import { EntryRowContent } from "@/components/kit/entry-row-content";

export function ExpenseListRow({
  expense,
  category,
  when,
  onClick,
}: {
  expense: ExpenseEntry;
  category?: Pick<ExpenseCategory, "name" | "color">;
  when?: string;
  onClick: (expense: ExpenseEntry) => void;
}) {
  return (
    <ListRow onClick={() => onClick(expense)}>
      <EntryRowContent
        entry={expense}
        color={category?.color}
        title={expense.note}
        when={when}
        subtitle={category?.name}
      />
    </ListRow>
  );
}
