"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { minorToInput } from "@/lib/money";
import { knownAccountId } from "@/lib/expense-account";
import { type CurrencyCode } from "@/lib/currency";
import {
  expenseFormSchema,
  toExpenseInput,
  type ExpenseFormValues,
} from "@/lib/expense-form";
import {
  deleteExpenseAction,
  updateExpenseAction,
} from "@/lib/actions/expenses";
import type { Category } from "@/repositories/categories";
import type { Expense } from "@/repositories/expenses";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { ExpenseFormFields } from "@/components/expenses/expense-form-fields";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

function toDefaults(e: Expense, accounts: ExpenseAccount[]): ExpenseFormValues {
  return {
    amount: minorToInput(e.amountMinor, e.currency),
    currency: e.currency,
    accountId: knownAccountId(accounts, e.accountId),
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
  onClose,
}: {
  expense: Expense;
  categories: Category[];
  accounts: ExpenseAccount[];
  displayCurrency: CurrencyCode;
  onClose: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const methods = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: toDefaults(expense, accounts),
  });
  const saving = methods.formState.isSubmitting;

  async function onSubmit(values: ExpenseFormValues) {
    let res;
    try {
      res = await updateExpenseAction(expense.id, toExpenseInput(values));
    } catch (error) {
      unstable_rethrow(error);
      toast.error("Не удалось обновить трату");
      return;
    }
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Трата обновлена");
    router.refresh();
    onClose();
  }

  async function onDelete() {
    setDeleting(true);
    let res;
    try {
      res = await deleteExpenseAction(expense.id);
    } catch (error) {
      unstable_rethrow(error);
      toast.error("Не удалось удалить трату");
      return;
    } finally {
      setDeleting(false);
    }
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Трата удалена");
    router.refresh();
    onClose();
  }

  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      ariaLabel="Трата"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).focus();
      }}
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
          />
          <div className="mt-1 flex gap-2.5">
            <Button
              variant="danger"
              iconOnly
              aria-label="Удалить трату"
              loading={deleting}
              disabled={saving}
              onClick={onDelete}
            >
              <Trash2 className="size-[22px]" strokeWidth={1.75} aria-hidden />
            </Button>
            <Button
              type="submit"
              className="flex-1"
              loading={saving}
              disabled={deleting}
            >
              Сохранить
            </Button>
          </div>
        </form>
      </FormProvider>
    </BottomSheet>
  );
}
