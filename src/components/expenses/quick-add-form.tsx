"use client";

import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { todayISO } from "@/lib/dates";
import { type CurrencyCode } from "@/lib/currency";
import {
  expenseFormSchema,
  toExpenseInput,
  type ExpenseFormValues,
} from "@/lib/expense-form";
import { createExpenseAction } from "@/lib/actions/expenses";
import { accountFallback } from "@/lib/expense-account";
import { runAction } from "@/lib/hooks/use-action-runner";
import { useSyncedState } from "@/lib/hooks/use-synced-state";
import type { CategoryWithUsage } from "@/repositories/categories";
import { cn } from "@/lib/utils";
import { Button } from "@/components/kit/button";
import {
  ExpenseFormFields,
  NO_ACCOUNTS_BUTTON_DIM,
} from "@/components/expenses/expense-form-fields";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

// Home screen quick-add form. The server action
// revalidates the route, so the summary and recent list update in place.
export function QuickAddForm({
  initialCategories,
  initialCategoryId,
  initialSelection,
  accounts,
  displayCurrency,
}: {
  initialCategories: CategoryWithUsage[];
  initialCategoryId: string;
  initialSelection: { accountId: string; currency: CurrencyCode } | null;
  accounts: ExpenseAccount[];
  displayCurrency: CurrencyCode;
}) {
  const [categories, setCategories] = useSyncedState(initialCategories);

  const methods = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema()),
    defaultValues: {
      amount: "",
      currency: initialSelection?.currency ?? displayCurrency,
      accountId: initialSelection?.accountId ?? "",
      categoryId: initialCategoryId,
      note: "",
      spentAt: todayISO(),
    },
  });

  useEffect(() => {
    methods.resetField("spentAt", { defaultValue: todayISO() });
  }, [methods]);

  useEffect(() => {
    const selected = methods.getValues("categoryId");
    if (selected && !categories.some((c) => c.id === selected)) {
      methods.setValue("categoryId", "");
    }
  }, [categories, methods]);

  useEffect(() => {
    const next = accountFallback(accounts, methods.getValues("accountId"));
    if (!next) return;
    methods.setValue("accountId", next.accountId);
    if (next.currency) methods.setValue("currency", next.currency);
    if (methods.getValues("amount") !== "") void methods.trigger("amount");
  }, [accounts, methods]);

  async function onSubmit(values: ExpenseFormValues) {
    const sent = methods.getValues();
    const saved = await runAction(
      () => createExpenseAction(toExpenseInput(values)),
      "Не удалось добавить трату",
      { success: "Трата добавлена" },
    );
    if (!saved) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === values.categoryId ? { ...c, hasExpenses: true } : c,
      ),
    );
    // The form stays editable while the save runs: clear only what the person
    // left untouched, and keep the account and category selected now.
    const now = methods.getValues();
    methods.reset({
      ...now,
      amount: now.amount === sent.amount ? "" : now.amount,
      note: now.note === sent.note ? "" : now.note,
      spentAt: now.spentAt === sent.spentAt ? todayISO() : now.spentAt,
    });
  }

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        aria-labelledby="new-expense-title"
        className="mx-4 mt-4 flex flex-col gap-5 rounded-card bg-card p-5"
        noValidate
      >
        <h2 id="new-expense-title" className="sr-only">
          Новая трата
        </h2>
        <ExpenseFormFields
          size="main"
          categoriesEditable
          categories={categories}
          onCategoriesChange={setCategories}
          accounts={accounts}
          displayCurrency={displayCurrency}
        />

        <Button
          type="submit"
          loading={methods.formState.isSubmitting}
          disabled={accounts.length === 0}
          className={cn("w-full", accounts.length === 0 && NO_ACCOUNTS_BUTTON_DIM)}
        >
          Добавить трату
        </Button>
      </form>
    </FormProvider>
  );
}
