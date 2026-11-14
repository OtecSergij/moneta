"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus } from "lucide-react";
import { createListAction } from "@/lib/actions/lists";
import { LIST_NAME_MAX } from "@/lib/lists";
import { runAction } from "@/lib/hooks/use-action-runner";
import { useLeaving } from "@/lib/hooks/use-leaving";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { MenuRow } from "@/components/kit/sheet-menu";
import { Switch } from "@/components/kit/switch";
import { TextField } from "@/components/kit/text-field";
import { RoundIconButton } from "@/components/kit/round-icon-button";

function ListNewForm({
  saving,
  run,
  onCreated,
}: {
  saving: boolean;
  run: (task: () => Promise<boolean>) => Promise<void>;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Введите название");
      return;
    }
    setError(undefined);
    await run(() =>
      runAction(
        () =>
          createListAction({
            name: trimmed,
            visibility: isPrivate ? "private" : "shared",
          }),
        "Не удалось создать список",
        { onSuccess: (list) => onCreated(list.id) },
      ),
    );
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
        disabled={saving}
      />
      <MenuRow
        Icon={Lock}
        labelId="list-new-private"
        variant="panel"
        disabled={saving}
        trailing={
          <Switch
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
            aria-labelledby="list-new-private"
            disabled={saving}
          />
        }
      >
        Виден только мне
      </MenuRow>
      <Button type="submit" loading={saving}>
        Создать список
      </Button>
    </form>
  );
}

export function ListNewButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, run } = useSheetTask(() => setOpen(false));
  const { busy, leave } = useLeaving(pending);

  return (
    <>
      <RoundIconButton
        icon={Plus}
        label="Новый список"
        onClick={() => setOpen(true)}
      />
      <BottomSheet
        open={open || busy}
        onOpenChange={setOpen}
        title="Новый список"
        busy={busy}
      >
        <ListNewForm
          saving={busy}
          run={run}
          onCreated={(id) => {
            leave();
            router.push(`/lists/${id}`);
          }}
        />
      </BottomSheet>
    </>
  );
}
