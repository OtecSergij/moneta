"use client";

import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { minorToInput } from "@/lib/money";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import { type CurrencyCode } from "@/lib/currency";
import {
  expenseFormSchema,
  expensePatch,
  type ExpenseFormValues,
} from "@/lib/expense-form";
import {
  deleteExpenseAction,
  updateExpenseAction,
} from "@/lib/actions/expenses";
import type { ExpenseCategory } from "@/repositories/categories";
import type { ExpenseEntry } from "@/lib/expense-entry";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { SheetEditActions } from "@/components/kit/sheet-edit-actions";
import { ExpenseFormFields } from "@/components/expenses/expense-form-fields";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

function toDefaults(e: ExpenseEntry): ExpenseFormValues {
  return {
    amount: minorToInput(e.amountMinor, e.currency),
    currency: e.currency,
    accountId: e.accountId,
    categoryId: e.categoryId,
    note: e.note,
    spentAt: e.spentAt,
  };
}

export function ExpenseSheet({
  expense,
  categories,
  accounts,
  displayCurrency,
  accountId,
  onClose,
}: {
  expense: ExpenseEntry;
  categories: ExpenseCategory[];
  accounts: ExpenseAccount[];
  displayCurrency: CurrencyCode;
  // The account whose page the card is opened on.
  accountId?: string;
  onClose: () => void;
}) {
  const run = useActionRunner("/accounts");
  const { pending: saving, run: runSave } = useSheetTask(onClose);
  const { pending: deleting, run: runDelete } = useSheetTask(onClose);

  const methods = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: toDefaults(expense),
  });
  const busy = saving || deleting;

  function onSubmit(values: ExpenseFormValues) {
    const patch = expensePatch(values, expense);
    return runSave(() =>
      run(
        () => updateExpenseAction(expense.id, patch, accountId),
        "Не удалось обновить трату",
        "Трата обновлена",
      ),
    );
  }

  function onDelete() {
    return runDelete(() =>
      run(
        () => deleteExpenseAction(expense.id, accountId),
        "Не удалось удалить трату",
        "Трата удалена",
      ),
    );
  }

  return (
    <BottomSheet
      variant="compact"
      onClose={onClose}
      ariaLabel="Трата"
      focusSheet
      busy={busy}
    >
      <FormProvider {...methods}>
        <form
          onSubmit={methods.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <ExpenseFormFields
            size="sheet"
            categories={categories}
            accounts={accounts}
            displayCurrency={displayCurrency}
            disabled={busy}
          />
          <SheetEditActions
            deleteLabel="Удалить трату"
            onDelete={onDelete}
            deleting={deleting}
            saving={saving}
          />
        </form>
      </FormProvider>
    </BottomSheet>
  );
}
