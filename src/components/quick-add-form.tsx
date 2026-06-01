"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { todayISO } from "@/lib/dates";
import {
  expenseFormSchema,
  toExpenseInput,
  type ExpenseFormValues,
} from "@/lib/expense-form";
import { createExpenseAction } from "@/lib/actions/expenses";
import type { Category } from "@/repositories/categories";
import { Button } from "@/components/ui/button";
import { ExpenseFormFields } from "@/components/expense-form-fields";

// Home screen quick-add form (business-spec §5.1.3). On success it revalidates
// (server action) and refreshes the route so the summary + recent list update
// without a manual reload.
export function QuickAddForm({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  const router = useRouter();
  // Seeded from props so onCreated can append + select a new category instantly
  // (optimistic). NOTE: this won't reflect category changes made elsewhere (e.g.
  // another tab) until a full reload — acceptable because the inline create form
  // is the only in-app mutation path and it updates this state directly.
  const [categories, setCategories] = useState(initialCategories);

  const methods = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: { amount: "", categoryId: "", note: "", spentAt: todayISO() },
  });

  async function onSubmit(values: ExpenseFormValues) {
    const res = await createExpenseAction(toExpenseInput(values));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Трата добавлена");
    methods.reset({ amount: "", categoryId: "", note: "", spentAt: todayISO() });
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
          categories={categories}
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
