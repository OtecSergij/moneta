"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { Check, MoreHorizontal, Plus } from "lucide-react";
import {
  addItemAction,
  deleteItemAction,
  deleteListAction,
  renameListAction,
  resetListAction,
  setItemCheckedAction,
  setItemTextAction,
  setListVisibilityAction,
} from "@/lib/actions/lists";
import {
  ITEM_TEXT_MAX,
  LIST_NAME_MAX,
  type ListActionResult,
  type ListVisibility,
} from "@/lib/lists";
import { onEnterKey } from "@/lib/enter-key";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import type { ListItem, ListWithItems } from "@/repositories/lists";
import {
  BackLink,
  DetailHeader,
  DetailTitle,
} from "@/components/kit/detail-header";
import { Button } from "@/components/kit/button";
import { RoundIconButton } from "@/components/kit/round-icon-button";
import { TextField } from "@/components/kit/text-field";
import { ListItemRow, keepFocus } from "@/components/lists/list-item-row";
import { ListMenuSheet } from "@/components/lists/list-menu-sheet";
import { ListProgress } from "@/components/lists/list-rows";

type Change =
  | { type: "name"; name: string }
  | { type: "visibility"; visibility: ListVisibility }
  | { type: "reset" }
  | { type: "add"; item: ListItem }
  | { type: "checked"; id: string; checked: boolean }
  | { type: "text"; id: string; text: string }
  | { type: "remove"; id: string };

function applyChange(list: ListWithItems, change: Change): ListWithItems {
  switch (change.type) {
    case "name":
      return { ...list, name: change.name };
    case "visibility":
      return { ...list, visibility: change.visibility };
    case "reset":
      return {
        ...list,
        items: list.items.map((i) => (i.checked ? { ...i, checked: false } : i)),
      };
    case "add":
      return { ...list, items: [...list.items, change.item] };
    case "checked":
      return {
        ...list,
        items: list.items.map((i) =>
          i.id === change.id ? { ...i, checked: change.checked } : i,
        ),
      };
    case "text":
      return {
        ...list,
        items: list.items.map((i) =>
          i.id === change.id ? { ...i, text: change.text } : i,
        ),
      };
    case "remove":
      return { ...list, items: list.items.filter((i) => i.id !== change.id) };
  }
}

const PENDING_PREFIX = "pending-";

export function ListScreen({ list: serverList }: { list: ListWithItems }) {
  const run = useActionRunner("/lists");
  const [list, addChange] = useOptimistic(serverList, applyChange);
  const [, startTransition] = useTransition();
  const [savingVisibility, startVisibility] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const pendingSeq = useRef(0);

  useEffect(() => {
    if (!renaming) return;
    // The sheet hands focus back to its trigger on close; take it afterwards.
    const t = setTimeout(() => titleRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [renaming]);

  function mutate(
    change: Change,
    call: () => Promise<ListActionResult<unknown>>,
    onError?: () => void,
  ) {
    startTransition(async () => {
      addChange(change);
      if (!(await run(call, "Не удалось сохранить"))) onError?.();
    });
  }

  const unchecked = list.items.filter((i) => !i.checked);
  const checked = list.items.filter((i) => i.checked);
  const ordered = [...unchecked, ...checked];

  function startRename() {
    setTitleDraft(list.name);
    setRenaming(true);
  }

  function saveTitle() {
    const name = titleDraft.trim();
    if (name.length === 0) return;
    setRenaming(false);
    if (name === list.name) return;
    mutate({ type: "name", name }, () => renameListAction(list.id, name));
  }

  function addItem() {
    const text = draft.trim();
    if (text.length === 0) return;
    setDraft("");
    pendingSeq.current += 1;
    const item = {
      id: `${PENDING_PREFIX}${pendingSeq.current}`,
      text,
      checked: false,
    };
    mutate(
      { type: "add", item },
      () => addItemAction(list.id, text),
      () => setDraft((current) => (current === "" ? text : current)),
    );
  }

  return (
    <>
      <DetailHeader>
        <BackLink href="/lists">Списки</BackLink>
        <RoundIconButton
          icon={MoreHorizontal}
          label="Действия со списком"
          onClick={() => setMenuOpen(true)}
        />
      </DetailHeader>

      <div className="flex flex-col gap-2.5 px-5 pt-2">
        {renaming ? (
          <div className="flex items-center gap-2">
            <TextField
              id="list-title"
              ref={titleRef}
              label="Название списка"
              labelHidden
              variant="heading"
              tone="card"
              type="text"
              value={titleDraft}
              maxLength={LIST_NAME_MAX}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) =>
                onEnterKey(e, saveTitle, () => setRenaming(false))
              }
              className="min-w-0 flex-1"
            />
            <Button
              size="md"
              iconOnly
              aria-label="Сохранить"
              onMouseDown={keepFocus}
              onClick={saveTitle}
              className="flex-none"
            >
              <Check aria-hidden className="size-[22px]" strokeWidth={1.75} />
            </Button>
          </div>
        ) : (
          <DetailTitle>{list.name}</DetailTitle>
        )}
        {list.items.length > 0 ? (
          <ListProgress
            done={checked.length}
            total={list.items.length}
            track="line"
            okWhenComplete={false}
          />
        ) : null}
      </div>

      <div className="mx-4 mt-4 overflow-hidden rounded-card bg-card">
        <div className="flex min-h-[52px] items-center gap-3 pr-4 pl-[15px]">
          <Plus aria-hidden className="size-[22px] flex-none text-primary" strokeWidth={1.75} />
          <TextField
            id="list-add-item"
            label="Новый пункт"
            labelHidden
            variant="frameless"
            type="text"
            placeholder="Добавить пункт"
            value={draft}
            maxLength={ITEM_TEXT_MAX}
            enterKeyHint="done"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => onEnterKey(e, addItem)}
            className="min-w-0 flex-1"
          />
        </div>
        {ordered.length > 0 ? (
          <ul>
            {ordered.map((item) => (
              <li key={item.id} className="border-t border-row-line">
                <ListItemRow
                  item={item}
                  editing={item.id === editingId}
                  pending={item.id.startsWith(PENDING_PREFIX)}
                  onToggle={() =>
                    mutate(
                      { type: "checked", id: item.id, checked: !item.checked },
                      () =>
                        setItemCheckedAction(list.id, item.id, !item.checked),
                    )
                  }
                  onEdit={() => setEditingId(item.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={(text) => {
                    setEditingId(null);
                    mutate({ type: "text", id: item.id, text }, () =>
                      setItemTextAction(list.id, item.id, text),
                    );
                  }}
                  onRemove={() => {
                    setEditingId(null);
                    mutate({ type: "remove", id: item.id }, () =>
                      deleteItemAction(list.id, item.id),
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ListMenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        name={list.name}
        isMine={list.isMine}
        isPrivate={list.visibility === "private"}
        deleting={deleting}
        savingPrivate={savingVisibility}
        onReset={() => {
          setMenuOpen(false);
          mutate({ type: "reset" }, () => resetListAction(list.id));
        }}
        onRename={() => {
          setMenuOpen(false);
          startRename();
        }}
        onPrivateChange={(isPrivate) => {
          const visibility = isPrivate ? "private" : "shared";
          startVisibility(async () => {
            addChange({ type: "visibility", visibility });
            await run(
              () => setListVisibilityAction(list.id, visibility),
              "Не удалось сохранить",
            );
          });
        }}
        onDelete={() =>
          startDelete(async () => {
            await run(() => deleteListAction(list.id), "Не удалось сохранить");
          })
        }
      />
    </>
  );
}
