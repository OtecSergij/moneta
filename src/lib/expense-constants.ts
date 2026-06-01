// Shared max length for an expense note. Referenced by the form schema
// (@/lib/expense-form) and the repository schema (@/repositories/expenses). The
// DB CHECK in db/schema/expenses.ts (char_length(note) <= 200) is the backstop
// and must stay in sync with this value.
export const EXPENSE_NOTE_MAX = 200;
