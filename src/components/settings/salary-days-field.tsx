"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SALARY_DAY_MAX } from "@/lib/settings";
import { updateSalaryDaysAction } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DAYS = Array.from({ length: SALARY_DAY_MAX }, (_, i) => i + 1);

// Both lists are kept sorted ascending, so an element-wise compare is enough.
function sameDays(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((d, i) => d === b[i]);
}

// Calendar grid of days 1–31; tap to toggle. Drives the History
// "с последней зарплаты" preset (business-spec §5.3). Save enables only when
// the selection differs from what's persisted.
export function SalaryDaysField({
  initialSalaryDays,
}: {
  initialSalaryDays: number[];
}) {
  const [saved, setSaved] = useState(() =>
    [...initialSalaryDays].sort((a, b) => a - b),
  );
  const [selected, setSelected] = useState(saved);
  const [saving, setSaving] = useState(false);

  function toggle(day: number) {
    setSelected((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  const dirty = !sameDays(selected, saved);

  async function onSave() {
    setSaving(true);
    const res = await updateSalaryDaysAction(selected);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSaved(res.data);
    setSelected(res.data);
    toast.success("Дни зарплаты сохранены");
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Дни зарплаты"
        className="grid grid-cols-7 gap-1.5"
      >
        {DAYS.map((day) => {
          const active = selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(day)}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                active
                  ? "border-accent bg-accent text-white"
                  : "border-border text-text hover:bg-border/60",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        onClick={onSave}
        loading={saving}
        disabled={!dirty}
        className="self-start"
      >
        Сохранить
      </Button>
    </div>
  );
}
