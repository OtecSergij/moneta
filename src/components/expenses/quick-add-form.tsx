"use client";

import { useState } from "react";
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
import type { Category } from "@/repositories/categories";
import { Button } from "@/components/ui/button";
import { ExpenseFormFields } from "@/components/expenses/expense-form-fields";

// Home screen quick-add form (business-spec §5.1.3). On success it revalidates
// (server action) and refreshes the route so the summary + recent list update
// without a manual reload.
export function QuickAddForm({
  initialCategories,
  initialCategoryId,
  initialCurrency,
  initialChargedCurrency,
  displayCurrency,
}: {
  initialCategories: Category[];
  initialCategoryId: string;
  initialCurrency: CurrencyCode;
  initialChargedCurrency: CurrencyCode | null;
  displayCurrency: CurrencyCode;
}) {
  const router = useRouter();
  // Seeded from props so onCreated can append + select a new category instantly
  // (optimistic). NOTE: this won't reflect category changes made elsewhere (e.g.
  // another tab) until a full reload — acceptable because the inline create form
  // is the only in-app mutation path and it updates this state directly.
  const [categories, setCategories] = useState(initialCategories);

  // Bumped after every successful submit and used as ExpenseFormFields' key,
  // forcing a remount — the same pattern use-expense-editor.tsx uses
  // (key={selected.id}) to reset a form's local state. methods.reset() below
  // only clears RHF-registered fields; ExpenseFormFields' chargedOpen panel
  // visibility is local useState that reset() can't reach, so without this
  // the fixation panel stays open into the next entry.
  const [submitCount, setSubmitCount] = useState(0);

  const methods = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      amount: "",
      currency: initialCurrency,
      categoryId: initialCategoryId,
      note: "",
      spentAt: todayISO(),
      // Carried in form state rather than component state so it survives the
      // key={submitCount} remount below. Harmless without a charged amount:
      // toExpenseInput only sends a complete pair (@/lib/expense-form).
      chargedCurrency: initialChargedCurrency ?? undefined,
    },
  });

  async function onSubmit(values: ExpenseFormValues) {
    const res = await createExpenseAction(toExpenseInput(values));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Трата добавлена");
    // Keep the just-used category and currency selected so adding several
    // similar expenses in a row doesn't require re-picking them
    // (business-spec §5.1) — a week of dinar entries costs zero extra taps.
    // The charged currency is kept for the same reason (the card doesn't
    // change between entries); the charged *amount* is not — it belongs to
    // the one expense that was just saved.
    methods.reset({
      amount: "",
      currency: values.currency,
      categoryId: values.categoryId,
      note: "",
      spentAt: todayISO(),
      chargedCurrency: values.chargedCurrency,
    });
    setSubmitCount((n) => n + 1);
    router.refresh();
  }

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <ExpenseFormFields
          key={submitCount}
          categories={categories}
          displayCurrency={displayCurrency}
          initialChargedCurrency={initialChargedCurrency}
          onCategoryCreated={(c) => {
            setCategories((prev) =>
              [...prev, c].sort((a, b) => a.name.localeCompare(b.name, "ru")),
            );
            methods.setValue("categoryId", c.id, { shouldValidate: true });
          }}
        />

        <Button
          type="submit"
          loading={methods.formState.isSubmitting}
          className="w-full"
        >
          Добавить
        </Button>
      </form>
    </FormProvider>
  );
}
