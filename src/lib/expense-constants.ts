// Shared max length for an expense note, and through TOP_UP_NOTE_MAX for a
// top-up note. Referenced by the form schema (@/lib/expense-form), the
// repository schema (@/repositories/expenses) and @/lib/top-ups. The DB CHECKs
// in db/schema/expenses.ts and db/schema/top-ups.ts (char_length(note) <= 200)
// are the backstop and must stay in sync with this value.
export const EXPENSE_NOTE_MAX = 200;
