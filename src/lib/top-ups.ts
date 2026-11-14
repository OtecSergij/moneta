import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currency";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import { entryDateField, refinePositiveAmount } from "@/lib/entry-form";
import { parseMoney } from "@/lib/money";
import type { TopUp } from "@/repositories/top-ups";

export const TOP_UP_NOTE_MAX = EXPENSE_NOTE_MAX;
export const TOP_UP_DEFAULT_NOTE = "Пополнение";

const TopUpNote = z
  .string()
  .trim()
  .max(TOP_UP_NOTE_MAX)
  .transform((note) => note || TOP_UP_DEFAULT_NOTE);

const TopUpFields = z.object({
  amountMinor: z.int().positive(),
  note: TopUpNote,
  occurredOn: z.iso.date(),
});

export const TopUpInput = TopUpFields.extend({ accountId: z.uuid() });
export type TopUpInput = z.infer<typeof TopUpInput>;

export const TopUpPatch = TopUpFields.partial().refine(
  (p) => p.amountMinor !== undefined || p.note !== undefined || p.occurredOn !== undefined,
);
export type TopUpPatch = z.infer<typeof TopUpPatch>;

export const topUpFormSchema = z
  .object({
    amount: z.string(),
    currency: z.enum(CURRENCY_CODES),
    note: z.string(),
    occurredOn: entryDateField,
  })
  .superRefine(refinePositiveAmount);
export type TopUpFormValues = z.infer<typeof topUpFormSchema>;

export function topUpNoteToInput(note: string): string {
  return note === TOP_UP_DEFAULT_NOTE ? "" : note;
}

// Only the fields that differ from `topUp`; every field for a new one.
export function topUpPatch(
  values: TopUpFormValues,
  topUp: Pick<TopUp, "amountMinor" | "note" | "occurredOn"> | null,
): TopUpPatch {
  const fields = {
    amountMinor: parseMoney(values.amount, values.currency)!,
    note: values.note.trim() || TOP_UP_DEFAULT_NOTE,
    occurredOn: values.occurredOn,
  };
  const patch: TopUpPatch = {};
  if (fields.amountMinor !== topUp?.amountMinor) patch.amountMinor = fields.amountMinor;
  if (fields.note !== topUp?.note) patch.note = fields.note;
  if (fields.occurredOn !== topUp?.occurredOn) patch.occurredOn = fields.occurredOn;
  return patch;
}
