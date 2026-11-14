"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormContext, useWatch } from "react-hook-form";
import { type ExpenseFormValues } from "@/lib/expense-form";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import type {
  CategoryWithUsage,
  ExpenseCategory,
} from "@/repositories/categories";
import { type CurrencyCode } from "@/lib/currency";
import { parseMoney } from "@/lib/money";
import { useConversionPreview } from "@/lib/hooks/use-conversion-preview";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import { TextField } from "@/components/kit/text-field";
import { AmountField } from "@/components/expenses/amount-field";
import {
  AccountChips,
  type ExpenseAccount,
} from "@/components/expenses/account-chips";
import { DateChips } from "@/components/expenses/date-chips";
import { CategoryChips } from "@/components/categories/category-chips";
import { NewCategoryPanel } from "@/components/categories/new-category-panel";
import { CategoryEditSheet } from "@/components/categories/category-edit-sheet";

const NO_ACCOUNTS_FIELD_DIM = "has-disabled:opacity-60!";
export const NO_ACCOUNTS_BUTTON_DIM = "disabled:opacity-60!";

type CategoryProps =
  | {
      categoriesEditable: true;
      categories: CategoryWithUsage[];
      onCategoriesChange: (next: CategoryWithUsage[]) => void;
    }
  | { categoriesEditable?: false; categories: ExpenseCategory[] };

export function ExpenseFormFields({
  displayCurrency,
  size,
  accounts,
  disabled = false,
  ...categoryProps
}: {
  displayCurrency: CurrencyCode;
  size: "main" | "sheet";
  accounts: ExpenseAccount[];
  disabled?: boolean;
} & CategoryProps) {
  const {
    register,
    control,
    setValue,
    trigger,
    formState: { errors },
  } = useFormContext<ExpenseFormValues>();

  const categoryId = useWatch({ control, name: "categoryId" });
  const spentAt = useWatch({ control, name: "spentAt" });
  const amount = useWatch({ control, name: "amount" });
  const currency = useWatch({ control, name: "currency" });
  const accountId = useWatch({ control, name: "accountId" });

  function selectCategory(id: string) {
    setValue("categoryId", id, { shouldValidate: true });
  }

  function selectAccount(id: string) {
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    setValue("accountId", id, { shouldValidate: true });
    setValue("currency", account.currency);
    if (amount !== "") void trigger("amount");
  }

  const noAccounts = accounts.length === 0;
  const noAccountsDim = noAccounts ? NO_ACCOUNTS_FIELD_DIM : undefined;

  const preview = useConversionPreview({
    amountMinor: parseMoney(amount, currency),
    currency,
    displayCurrency,
    date: spentAt,
  });

  return (
    <>
      <AmountField
        id={size === "main" ? "amount" : "e-amount"}
        size={size}
        currency={currency}
        preview={preview}
        error={errors.amount?.message}
        {...register("amount")}
        disabled={noAccounts || disabled}
        className={noAccountsDim}
      />

      {!noAccounts ? (
        <AccountChips
          accounts={accounts}
          value={accountId}
          onChange={selectAccount}
          error={errors.accountId?.message}
          disabled={disabled}
        />
      ) : (
        <Link
          href="/accounts"
          className="self-start text-sm text-ink-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Создайте первый счёт
        </Link>
      )}

      {categoryProps.categoriesEditable ? (
        <EditableCategories
          categories={categoryProps.categories}
          onCategoriesChange={categoryProps.onCategoriesChange}
          value={categoryId}
          onChange={selectCategory}
          error={errors.categoryId?.message}
          onRemoved={(id) => {
            if (id === categoryId) setValue("categoryId", "");
          }}
        />
      ) : (
        <CategoryChips
          categories={categoryProps.categories}
          value={categoryId}
          onChange={selectCategory}
          error={errors.categoryId?.message}
          disabled={disabled}
        />
      )}

      <TextField
        id={size === "main" ? "note" : "e-note"}
        label="Описание"
        labelGap={size === "main" ? 8 : 6}
        placeholder="Например, кофе с собой"
        maxLength={EXPENSE_NOTE_MAX}
        error={errors.note?.message}
        {...register("note")}
        disabled={noAccounts || disabled}
        className={noAccountsDim}
      />

      <DateChips
        value={spentAt ?? ""}
        onChange={(iso) => setValue("spentAt", iso, { shouldValidate: true })}
        error={errors.spentAt?.message}
        disabled={disabled}
      />
    </>
  );
}

function EditableCategories({
  categories,
  onCategoriesChange,
  value,
  onChange,
  error,
  onRemoved,
}: {
  categories: CategoryWithUsage[];
  onCategoriesChange: (next: CategoryWithUsage[]) => void;
  value: string;
  onChange: (id: string) => void;
  error?: string;
  onRemoved: (id: string) => void;
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const creating = useSheetTask();
  const empty = categories.length === 0;
  const editing = categories.find((c) => c.id === editingId) ?? null;

  return (
    <>
      <CategoryChips
        editable
        categories={categories}
        value={value}
        onChange={onChange}
        error={error}
        onEdit={setEditingId}
        newOpen={newOpen || empty}
        newDisabled={creating.pending}
        onNewToggle={() => setNewOpen(!newOpen)}
      >
        {newOpen || empty ? (
          <NewCategoryPanel
            categories={categories}
            autoFocus={newOpen}
            saveTask={creating}
            onCancel={empty ? undefined : () => setNewOpen(false)}
            onCreated={(c) => {
              onCategoriesChange([...categories, { ...c, hasExpenses: false }]);
              onChange(c.id);
              setNewOpen(false);
            }}
          />
        ) : null}
      </CategoryChips>
      <CategoryEditSheet
        category={editing}
        onClose={() => setEditingId(null)}
        onSaved={(c) => {
          onCategoriesChange(
            categories.map((prev) =>
              prev.id === c.id ? { ...c, hasExpenses: prev.hasExpenses } : prev,
            ),
          );
          setEditingId(null);
        }}
        onRemoved={(id) => {
          onCategoriesChange(categories.filter((c) => c.id !== id));
          onRemoved(id);
          setEditingId(null);
        }}
        onRemoveRejected={() => {
          onCategoriesChange(
            categories.map((c) =>
              c.id === editingId ? { ...c, hasExpenses: true } : c,
            ),
          );
          setEditingId(null);
        }}
      />
    </>
  );
}
