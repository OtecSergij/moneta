"use client";

import { useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { createListAction } from "@/lib/actions/lists";
import { LIST_NAME_MAX } from "@/lib/lists";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { Switch } from "@/components/kit/switch";
import { TextField } from "@/components/kit/text-field";
import { HeaderAddButton } from "@/components/layout/screen-header";

function ListNewForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Введите название");
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const res = await createListAction({
        name: trimmed,
        visibility: isPrivate ? "private" : "shared",
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onCreated(res.data.id);
    } catch (error) {
      unstable_rethrow(error);
      toast.error("Не удалось создать список");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TextField
        label="Название"
        labelHidden
        size="lg"
        placeholder="Например, продукты на неделю"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={LIST_NAME_MAX}
        autoFocus
        error={error}
      />
      <div className="flex items-center gap-4 rounded-panel bg-page px-4 py-3.5">
        <span
          id="list-new-private"
          className="flex flex-1 items-center gap-1.5 text-[15px] font-semibold"
        >
          <Lock aria-hidden className="size-4" strokeWidth={1.75} />
          Виден только мне
        </span>
        <Switch
          checked={isPrivate}
          onCheckedChange={setIsPrivate}
          aria-labelledby="list-new-private"
        />
      </div>
      <Button type="submit" loading={saving}>
        Создать список
      </Button>
    </form>
  );
}

export function ListNewButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <HeaderAddButton label="Новый список" onClick={() => setOpen(true)} />
      <BottomSheet open={open} onOpenChange={setOpen} title="Новый список">
        <ListNewForm
          onCreated={(id) => {
            setOpen(false);
            router.push(`/lists/${id}`);
          }}
        />
      </BottomSheet>
    </>
  );
}
