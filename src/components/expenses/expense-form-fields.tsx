"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormContext, useWatch } from "react-hook-form";
import { type ExpenseFormValues } from "@/lib/expense-form";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import type {
  Category,
  CategoryWithUsage,
} from "@/repositories/categories";
import { type CurrencyCode } from "@/lib/currency";
import { formatMoney, parseMoney } from "@/lib/money";
import { quoteConversionAction } from "@/lib/actions/fx";
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

const PREVIEW_DEBOUNCE_MS = 300;

type ConversionQuote =
  | { status: "unavailable" }
  | { status: "value"; convertedMinor: number; displayCurrency: CurrencyCode };

type VisiblePreview = { status: "pending" } | ConversionQuote;

function previewLabel(preview: VisiblePreview): string {
  if (preview.status === "value") {
    return `≈ ${formatMoney(preview.convertedMinor, preview.displayCurrency)}`;
  }
  return preview.status === "unavailable" ? "Курс недоступен" : "≈ …";
}

type CategoryProps =
  | {
      categoriesEditable: true;
      categories: CategoryWithUsage[];
      onCategoriesChange: (next: CategoryWithUsage[]) => void;
    }
  | { categoriesEditable?: false; categories: Category[] };

export function ExpenseFormFields({
  displayCurrency,
  size,
  accounts,
  ...categoryProps
}: {
  displayCurrency: CurrencyCode;
  size: "main" | "sheet";
  accounts: ExpenseAccount[];
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

  // With matching currencies convert.ts's identity rule returns exactly the
  // entered amount, so there is nothing to show and no quote to request.
  const currenciesDiffer = currency !== displayCurrency;

  const minor = parseMoney(amount, currency);

  const previewKey =
    currenciesDiffer && minor !== null && minor > 0
      ? `${minor}|${currency}|${displayCurrency}|${spentAt}`
      : null;

  // Resolved answers are keyed by the exact inputs they answer for, so
  // "pending" vs. "resolved" falls out of a plain render-time comparison
  // below instead of a synchronous setState in the effect body
  // (react-hooks/set-state-in-effect) — the effect only ever calls setState
  // from inside the async callback.
  const [resolved, setResolved] = useState<{
    key: string;
    result: ConversionQuote;
  } | null>(null);

  // Debounced live preview: quoteConversionAction is a server round-trip, so
  // typing shouldn't fire it on every keystroke, and a failure must never
  // block the amount input itself (plan Step 6.4).
  useEffect(() => {
    if (previewKey === null) return;

    let cancelled = false;
    const key = previewKey;
    const timer = setTimeout(() => {
      quoteConversionAction({ amountMinor: minor, currency, spentAt }).then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setResolved({ key, result: { status: "unavailable" } });
          return;
        }
        const { convertedMinor, displayCurrency: quotedIn } = res.data;
        setResolved({
          key,
          result:
            convertedMinor === null
              ? { status: "unavailable" }
              : { status: "value", convertedMinor, displayCurrency: quotedIn },
        });
      }).catch(() => {
        // requireSession redirects by throwing; mid-typing that lands here
        // rather than as an unhandled rejection while the redirect proceeds.
        if (!cancelled) setResolved({ key, result: { status: "unavailable" } });
      });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewKey, minor, currency, spentAt]);

  const preview: VisiblePreview | null =
    previewKey === null
      ? null
      : resolved && resolved.key === previewKey
        ? resolved.result
        : { status: "pending" };

  return (
    <>
      <AmountField
        id={size === "main" ? "amount" : "e-amount"}
        size={size}
        currency={currency}
        preview={preview ? previewLabel(preview) : null}
        error={errors.amount?.message}
        {...register("amount")}
        disabled={noAccounts}
      />

      {!noAccounts ? (
        <AccountChips
          accounts={accounts}
          value={accountId}
          onChange={selectAccount}
          error={errors.accountId?.message}
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
        disabled={noAccounts}
      />

      <DateChips
        value={spentAt ?? ""}
        onChange={(iso) => setValue("spentAt", iso, { shouldValidate: true })}
        error={errors.spentAt?.message}
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
        onNewToggle={() => setNewOpen(!newOpen)}
      >
        {newOpen || empty ? (
          <NewCategoryPanel
            categories={categories}
            autoFocus={newOpen}
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
