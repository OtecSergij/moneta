"use client";

import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { todayISO } from "@/lib/dates";
import { type ExpenseFormValues } from "@/lib/expense-form";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import type { Category } from "@/repositories/categories";
import { type CurrencyCode } from "@/lib/currency";
import {
  type ConversionPreview,
  type ConversionQuote,
  type VisiblePreview,
  resolveFixationSlot,
} from "@/lib/fixation-slot";
import { formatMoney, parseMoney } from "@/lib/money";
import { quoteConversionAction } from "@/lib/actions/fx";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { CurrencySegment } from "@/components/ui/currency-segment";
import { CategorySelect } from "@/components/expenses/category-select";
import { ChargedAmountField } from "@/components/expenses/charged-amount-field";

const PREVIEW_DEBOUNCE_MS = 300;

const SLOT_CLASS =
  "inline-flex min-h-11 w-fit items-center self-start rounded-md px-1 text-sm text-text-muted";
const SLOT_TAPPABLE_CLASS =
  "cursor-pointer underline decoration-dotted underline-offset-4 transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

function previewLabel(preview: VisiblePreview): string {
  if (preview.status === "value") {
    return formatMoney(preview.convertedMinor, preview.displayCurrency);
  }
  return preview.status === "unavailable" ? "курс недоступен" : "…";
}

export function ExpenseFormFields({
  categories,
  displayCurrency,
  initialChargedCurrency,
  onCategoryCreated,
}: {
  categories: Category[];
  displayCurrency: CurrencyCode;
  initialChargedCurrency: CurrencyCode | null;
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
  const chargedAmount = useWatch({ control, name: "chargedAmount" });
  const chargedCurrency = useWatch({ control, name: "chargedCurrency" });

  // Starts open when editing a row that already carries a fixation. It only
  // ever closes through ChargedAmountField's own remove button, which clears
  // the pair first: nothing else may take an entered fixation off screen and
  // leave it silently in the form.
  const [chargedOpen, setChargedOpen] = useState(() => !!chargedAmount);

  // Controlled date field (value + setValue), NOT register(): an uncontrolled
  // register'd date input desync'd from the form after reset() — adding a second
  // expense in a row left spentAt empty/"invalid" though the picker showed a
  // date. The plain ref only sets `max` post-mount (hydration-safe, no setState).
  const spentAtRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (spentAtRef.current) spentAtRef.current.max = todayISO();
  }, []);

  // Gates the network quote only: with matching currencies convert.ts's
  // identity rule returns exactly the entered amount, so the round-trip would
  // buy nothing. It deliberately does NOT gate the fixation affordance — what
  // the bank debited is a fact about the expense, and recording it changes the
  // row's value in every other display currency (see resolveFixationSlot).
  const currenciesDiffer = currency !== displayCurrency;

  const minor = parseMoney(amount, currency);

  // Mirrors toExpenseInput's "hasCharged" gate (@/lib/expense-form): both
  // halves of the fixation must be present and the amount must actually
  // parse, or the preview treats it the same as no fixation at all — which
  // is exactly what gets saved.
  const chargedParsed =
    chargedAmount && chargedCurrency
      ? parseMoney(chargedAmount, chargedCurrency)
      : null;
  const hasCharged = chargedParsed !== null && chargedParsed > 0;
  const chargedMinor = hasCharged ? chargedParsed : null;
  const chargedCurrencyValue = hasCharged ? chargedCurrency! : null;

  const previewKey =
    minor !== null && minor > 0
      ? `${minor}|${currency}|${displayCurrency}|${spentAt}|${chargedMinor}|${chargedCurrencyValue}`
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
    if (!currenciesDiffer || previewKey === null) return;

    let cancelled = false;
    const key = previewKey;
    const timer = setTimeout(() => {
      quoteConversionAction({
        amountMinor: minor,
        currency,
        spentAt,
        chargedAmountMinor: chargedMinor,
        chargedCurrency: chargedCurrencyValue,
      }).then((res) => {
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
  }, [
    previewKey,
    minor,
    currency,
    displayCurrency,
    spentAt,
    currenciesDiffer,
    chargedMinor,
    chargedCurrencyValue,
  ]);

  const preview: ConversionPreview =
    previewKey === null
      ? { status: "empty" }
      : resolved && resolved.key === previewKey
        ? resolved.result
        : { status: "pending" };

  const slot = resolveFixationSlot({
    currenciesDiffer,
    panelOpen: chargedOpen,
    preview,
  });

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

          {slot.kind === "hidden" ? null : slot.kind === "preview-status" ? (
            <p className={SLOT_CLASS}>{previewLabel(slot.preview)}</p>
          ) : (
            <button
              type="button"
              onClick={() => setChargedOpen(true)}
              className={cn(SLOT_CLASS, SLOT_TAPPABLE_CLASS)}
            >
              {slot.kind === "prompt"
                ? "Указать списание"
                : previewLabel(slot.preview)}
            </button>
          )}

          {chargedOpen ? (
            <ChargedAmountField
              entryCurrency={currency}
              lastChargedCurrency={initialChargedCurrency}
              displayCurrency={displayCurrency}
              onRemove={() => setChargedOpen(false)}
            />
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
