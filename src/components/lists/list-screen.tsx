"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { Check, ChevronLeft, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
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
import type { ListItem, ListWithItems } from "@/repositories/lists";
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
  const router = useRouter();
  const [list, addChange] = useOptimistic(serverList, applyChange);
  const [, startTransition] = useTransition();
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
    change: Change | null,
    call: () => Promise<ListActionResult<unknown>>,
    onError?: () => void,
  ) {
    startTransition(async () => {
      if (change) addChange(change);
      let res: ListActionResult<unknown>;
      try {
        res = await call();
      } catch (error) {
        unstable_rethrow(error);
        toast.error("Не удалось сохранить");
        onError?.();
        return;
      }
      if (res.ok) return;
      toast.error(res.error);
      onError?.();
      if ("notFound" in res) router.replace("/lists");
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
      <div className="flex items-center justify-between pt-3 pr-2.5 pl-1.5">
        <Link
          href="/lists"
          className="flex h-11 items-center gap-0.5 rounded-control pr-2.5 pl-1 text-base font-medium text-primary-ink focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ChevronLeft aria-hidden className="size-[22px]" strokeWidth={1.75} />
          Списки
        </Link>
        <button
          type="button"
          aria-label="Действия со списком"
          onClick={() => setMenuOpen(true)}
          className="flex size-11 cursor-pointer items-center justify-center rounded-chip bg-card text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <MoreHorizontal aria-hidden className="size-[22px]" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex flex-col gap-2.5 px-5 pt-2">
        {renaming ? (
          <div className="flex items-center gap-2">
            <label htmlFor="list-title" className="sr-only">
              Название списка
            </label>
            <input
              id="list-title"
              ref={titleRef}
              type="text"
              value={titleDraft}
              maxLength={LIST_NAME_MAX}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  saveTitle();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setRenaming(false);
                }
              }}
              className="h-12 min-w-0 flex-1 rounded-field bg-card px-3.5 text-2xl font-bold tracking-[-0.02em] text-ink shadow-[inset_0_0_0_2px_var(--color-primary)] outline-none"
            />
            <button
              type="button"
              aria-label="Сохранить"
              onMouseDown={keepFocus}
              onClick={saveTitle}
              className="flex size-12 flex-none cursor-pointer items-center justify-center rounded-field bg-primary text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Check aria-hidden className="size-[22px]" strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <h1 className="text-[28px]/[34px] font-bold tracking-[-0.02em] break-words">
            {list.name}
          </h1>
        )}
        {list.items.length > 0 ? (
          <ListProgress
            done={checked.length}
            total={list.items.length}
            trackClassName="bg-line"
          />
        ) : null}
      </div>

      <div className="mx-4 mt-4 overflow-hidden rounded-card bg-card">
        <div className="flex min-h-[52px] items-center gap-3 pr-4 pl-[15px]">
          <Plus aria-hidden className="size-[22px] flex-none text-primary" strokeWidth={1.75} />
          <label htmlFor="list-add-item" className="sr-only">
            Новый пункт
          </label>
          <input
            id="list-add-item"
            type="text"
            placeholder="Добавить пункт"
            value={draft}
            maxLength={ITEM_TEXT_MAX}
            enterKeyHint="done"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addItem();
              }
            }}
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
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
          mutate({ type: "visibility", visibility }, () =>
            setListVisibilityAction(list.id, visibility),
          );
        }}
        onDelete={() => {
          setMenuOpen(false);
          mutate(null, () => deleteListAction(list.id));
        }}
      />
    </>
  );
}
