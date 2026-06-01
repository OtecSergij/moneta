"use client";

import { useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { todayISO } from "@/lib/dates";
import { type ExpenseFormValues } from "@/lib/expense-form";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import type { Category } from "@/repositories/categories";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { CategorySelect } from "@/components/expenses/category-select";

export function ExpenseFormFields({
  categories,
  onCategoryCreated,
}: {
  categories: Category[];
  onCategoryCreated: (category: Category) => void;
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<ExpenseFormValues>();

  const categoryId = useWatch({ control, name: "categoryId" });
  const spentAt = useWatch({ control, name: "spentAt" });

  // Controlled date field (value + setValue), NOT register(): an uncontrolled
  // register'd date input desync'd from the form after reset() — adding a second
  // expense in a row left spentAt empty/"invalid" though the picker showed a
  // date. The plain ref only sets `max` post-mount (hydration-safe, no setState).
  const spentAtRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (spentAtRef.current) spentAtRef.current.max = todayISO();
  }, []);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Сумма" htmlFor="amount" error={errors.amount?.message}>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            >
              ₽
            </span>
            <TextInput
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              className="pl-8 tabular-nums"
              aria-invalid={!!errors.amount}
              {...register("amount")}
            />
          </div>
        </Field>

        <CategorySelect
          categories={categories}
          value={categoryId}
          onChange={(id) =>
            setValue("categoryId", id, { shouldValidate: true })
          }
          onCreated={onCategoryCreated}
          error={errors.categoryId?.message}
        />
      </div>

      <Field label="Описание" htmlFor="note" error={errors.note?.message}>
        <TextInput
          id="note"
          maxLength={EXPENSE_NOTE_MAX}
          aria-invalid={!!errors.note}
          {...register("note")}
        />
      </Field>

      <Field label="Дата" htmlFor="spentAt" error={errors.spentAt?.message}>
        <TextInput
          id="spentAt"
          type="date"
          ref={spentAtRef}
          value={spentAt ?? ""}
          onChange={(e) =>
            setValue("spentAt", e.target.value, { shouldValidate: true })
          }
          aria-invalid={!!errors.spentAt}
        />
      </Field>
    </>
  );
}
