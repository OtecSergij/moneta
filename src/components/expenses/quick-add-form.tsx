"use client";

import { useEffect, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { todayISO } from "@/lib/dates";
import { type CurrencyCode } from "@/lib/currency";
import {
  expenseFormSchema,
  toExpenseInput,
  type ExpenseFormValues,
} from "@/lib/expense-form";
import { createExpenseAction } from "@/lib/actions/expenses";
import { defaultAccountSelection } from "@/lib/expense-account";
import type { CategoryWithUsage } from "@/repositories/categories";
import { Button } from "@/components/kit/button";
import { ExpenseFormFields } from "@/components/expenses/expense-form-fields";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

// Home screen quick-add form (business-spec §5.1.3). The server action
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
  const [categories, setCategories] = useState(initialCategories);
  const [seenCategories, setSeenCategories] = useState(initialCategories);
  if (seenCategories !== initialCategories) {
    setSeenCategories(initialCategories);
    setCategories(initialCategories);
  }

  const methods = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
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
    const selected = methods.getValues("accountId");
    if (accounts.some((a) => a.id === selected)) return;
    const next = defaultAccountSelection(accounts, null);
    methods.setValue("accountId", next?.accountId ?? "");
    if (next) methods.setValue("currency", next.currency);
    if (methods.getValues("amount") !== "") void methods.trigger("amount");
  }, [accounts, methods]);

  async function onSubmit(values: ExpenseFormValues) {
    let res;
    try {
      res = await createExpenseAction(toExpenseInput(values));
    } catch (error) {
      unstable_rethrow(error);
      toast.error("Не удалось добавить трату");
      return;
    }
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Трата добавлена");
    setCategories((prev) =>
      prev.map((c) =>
        c.id === values.categoryId ? { ...c, hasExpenses: true } : c,
      ),
    );
    // Keep the just-used account, category and currency selected so adding
    // several similar expenses in a row doesn't require re-picking them
    // (business-spec §5.1) — a week of dinar entries costs zero extra taps.
    methods.reset({
      amount: "",
      currency: values.currency,
      accountId: values.accountId,
      categoryId: values.categoryId,
      note: "",
      spentAt: todayISO(),
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
          className="w-full"
        >
          Добавить трату
        </Button>
      </form>
    </FormProvider>
  );
}
