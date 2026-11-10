"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import type { CategoryWithUsage } from "@/repositories/categories";
import { Button } from "@/components/kit/button";
import { ExpenseFormFields } from "@/components/expenses/expense-form-fields";

// Home screen quick-add form (business-spec §5.1.3). On success it revalidates
// (server action) and refreshes the route so the summary + recent list update
// without a manual reload.
export function QuickAddForm({
  initialCategories,
  initialCategoryId,
  initialCurrency,
  displayCurrency,
}: {
  initialCategories: CategoryWithUsage[];
  initialCategoryId: string;
  initialCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
}) {
  const router = useRouter();
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
      currency: initialCurrency,
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

  async function onSubmit(values: ExpenseFormValues) {
    const res = await createExpenseAction(toExpenseInput(values));
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
    // Keep the just-used category and currency selected so adding several
    // similar expenses in a row doesn't require re-picking them
    // (business-spec §5.1) — a week of dinar entries costs zero extra taps.
    methods.reset({
      amount: "",
      currency: values.currency,
      categoryId: values.categoryId,
      note: "",
      spentAt: todayISO(),
    });
    router.refresh();
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
          displayCurrency={displayCurrency}
        />

        <Button
          type="submit"
          loading={methods.formState.isSubmitting}
          className="w-full"
        >
          Добавить трату
        </Button>
      </form>
    </FormProvider>
  );
}
