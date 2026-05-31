"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { parseMoney } from "@/lib/money";
import { isFutureISO, todayISO } from "@/lib/dates";
import { createExpenseAction } from "@/lib/actions/expenses";
import type { Category } from "@/repositories/categories";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/components/category-select";

const schema = z.object({
  amount: z
    .string()
    .refine((s) => {
      const minor = parseMoney(s);
      return minor !== null && minor > 0;
    }, "Введите сумму больше нуля"),
  categoryId: z.uuid("Выберите категорию"),
  note: z.string().max(200, "Не больше 200 символов").optional(),
  spentAt: z
    .iso
    .date("Укажите дату")
    .refine((d) => !isFutureISO(d), "Дата не может быть в будущем"),
});
type Values = z.infer<typeof schema>;

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

  // max depends on new Date(); keeping it in JSX would bake the server's date
  // (the VPS is likely UTC) into the SSR HTML and mismatch the client at
  // hydration — off-by-one near local midnight. So leave it out of the markup
  // and set the DOM attribute directly post-mount via this ref (an effect
  // updating an external system, not React state). defaultValues.spentAt is
  // unaffected: RHF applies it via ref on the client, not into the SSR HTML.
  const spentAtRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (spentAtRef.current) spentAtRef.current.max = todayISO();
  }, []);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount: "", categoryId: "", note: "", spentAt: todayISO() },
  });

  // useWatch (a proper hook) rather than the watch() function — the latter
  // can't be memoized and trips the React Compiler lint rule.
  const categoryId = useWatch({ control, name: "categoryId" });
  // Merge RHF's ref with our own, with a stable identity (register is stable in
  // RHF) so React doesn't detach/reattach the ref on every render.
  const setSpentAtRef = useCallback(
    (el: HTMLInputElement | null) => {
      register("spentAt").ref(el);
      spentAtRef.current = el;
    },
    [register],
  );

  async function onSubmit(values: Values) {
    const amountMinor = parseMoney(values.amount);
    if (amountMinor === null) return; // guarded by the schema; satisfies TS

    const res = await createExpenseAction({
      categoryId: values.categoryId,
      amountMinor,
      currency: "RUB",
      note: values.note?.trim() ? values.note.trim() : undefined,
      spentAt: values.spentAt,
    });

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Трата добавлена");
    reset({ amount: "", categoryId: "", note: "", spentAt: todayISO() });
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
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
          onChange={(id) => setValue("categoryId", id, { shouldValidate: true })}
          onCreated={(c) => {
            setCategories((prev) =>
              [...prev, c].sort((a, b) => a.name.localeCompare(b.name, "ru")),
            );
            setValue("categoryId", c.id, { shouldValidate: true });
          }}
          error={errors.categoryId?.message}
        />
      </div>

      <Field
        label="Заметка"
        htmlFor="note"
        error={errors.note?.message}
      >
        <TextInput
          id="note"
          placeholder="Необязательно"
          maxLength={200}
          aria-invalid={!!errors.note}
          {...register("note")}
        />
      </Field>

      <div className="grid items-end gap-4 sm:grid-cols-2">
        <Field label="Дата" htmlFor="spentAt" error={errors.spentAt?.message}>
          <TextInput
            id="spentAt"
            type="date"
            aria-invalid={!!errors.spentAt}
            {...register("spentAt")}
            ref={setSpentAtRef}
          />
        </Field>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Добавить
        </Button>
      </div>
    </form>
  );
}
