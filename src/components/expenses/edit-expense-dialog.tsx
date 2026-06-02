"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { minorToInput } from "@/lib/money";
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
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ExpenseFormFields } from "@/components/expenses/expense-form-fields";

function toDefaults(e: Expense): ExpenseFormValues {
  return {
    amount: minorToInput(e.amountMinor),
    categoryId: e.categoryId,
    note: e.note,
    spentAt: e.spentAt,
  };
}

export function EditExpenseDialog({
  expense,
  categories,
  onClose,
}: {
  expense: Expense;
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [categoryList, setCategoryList] = useState(categories);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const methods = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: toDefaults(expense),
  });

  async function onSubmit(values: ExpenseFormValues) {
    const res = await updateExpenseAction(expense.id, toExpenseInput(values));
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
    const res = await deleteExpenseAction(expense.id);
    setDeleting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Трата удалена");
    router.refresh();
    onClose();
  }

  return (
    <Modal title="Редактировать трату" onClose={onClose}>
      <FormProvider {...methods}>
        <form
          onSubmit={methods.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <ExpenseFormFields
            categories={categoryList}
            onCategoryCreated={(c) => {
              setCategoryList((prev) =>
                [...prev, c].sort((a, b) => a.name.localeCompare(b.name, "ru")),
              );
              methods.setValue("categoryId", c.id, {
                shouldValidate: true,
              });
            }}
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            {confirmDelete ? (
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm text-text-muted">Удалить трату?</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    loading={deleting}
                    onClick={onDelete}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
                >
                  <Trash2 className="size-4" /> Удалить
                </button>
                <Button type="submit" loading={methods.formState.isSubmitting}>
                  Сохранить
                </Button>
              </>
            )}
          </div>
        </form>
      </FormProvider>
    </Modal>
  );
}
