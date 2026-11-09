"use client";

import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { todayISO } from "@/lib/dates";
import { type ExpenseFormValues } from "@/lib/expense-form";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import type { Category } from "@/repositories/categories";
import { type CurrencyCode } from "@/lib/currency";
import { formatMoney, parseMoney } from "@/lib/money";
import { quoteConversionAction } from "@/lib/actions/fx";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { CurrencySegment } from "@/components/ui/currency-segment";
import { CategorySelect } from "@/components/expenses/category-select";

const PREVIEW_DEBOUNCE_MS = 300;

type ConversionQuote =
  | { status: "unavailable" }
  | { status: "value"; convertedMinor: number; displayCurrency: CurrencyCode };

type VisiblePreview = { status: "pending" } | ConversionQuote;

function previewLabel(preview: VisiblePreview): string {
  if (preview.status === "value") {
    return formatMoney(preview.convertedMinor, preview.displayCurrency);
  }
  return preview.status === "unavailable" ? "курс недоступен" : "…";
}

export function ExpenseFormFields({
  categories,
  displayCurrency,
  onCategoryCreated,
}: {
  categories: Category[];
  displayCurrency: CurrencyCode;
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
  const amount = useWatch({ control, name: "amount" });
  const currency = useWatch({ control, name: "currency" });

  // Controlled date field (value + setValue), NOT register(): an uncontrolled
  // register'd date input desync'd from the form after reset() — adding a second
  // expense in a row left spentAt empty/"invalid" though the picker showed a
  // date. The plain ref sets `max` post-render (hydration-safe, no setState),
  // and again whenever the date changes, so the quick-add reset() after
  // midnight lifts the cap to the new today.
  const spentAtRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (spentAtRef.current) spentAtRef.current.max = todayISO();
  }, [spentAt]);

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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Сумма" htmlFor="amount" error={errors.amount?.message}>
            <TextInput
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              className="tabular-nums"
              aria-invalid={!!errors.amount}
              {...register("amount")}
            />
          </Field>

          <CurrencySegment
            value={currency}
            onChange={(c) =>
              setValue("currency", c, { shouldValidate: true })
            }
            label="Валюта траты"
          />

          {preview ? (
            <p className="inline-flex min-h-11 w-fit items-center self-start px-1 text-sm text-text-muted">
              {previewLabel(preview)}
            </p>
          ) : null}
        </div>

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
