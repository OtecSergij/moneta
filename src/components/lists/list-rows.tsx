"use client";

import { useId, useRef, useState, useTransition, type MouseEvent } from "react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { moveListAction } from "@/lib/actions/lists";
import { LONG_PRESS_CLASS } from "@/lib/hooks/use-long-press";
import {
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
} from "@/lib/long-press";
import type { ListSummary } from "@/repositories/lists";
import { cn } from "@/lib/utils";

export function ListProgress({
  done,
  total,
  trackClassName,
  okWhenComplete = true,
}: {
  done: number;
  total: number;
  trackClassName: string;
  okWhenComplete?: boolean;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span
      aria-hidden
      className={cn("block h-1 overflow-hidden rounded-chip", trackClassName)}
    >
      <span
        className={cn(
          "block h-full rounded-chip",
          okWhenComplete && total > 0 && done === total ? "bg-ok" : "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

export function PrivateBadge() {
  return (
    <span className="flex flex-none items-center gap-1 rounded-chip bg-page py-0.5 pr-2 pl-1.5 text-xs font-medium text-ink-badge">
      <Lock aria-hidden className="size-3" strokeWidth={1.75} />
      Только мне
    </span>
  );
}

const ROW_CLASS = "flex flex-col gap-2.5 p-4 text-ink";

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "Чтобы переставить список, нажмите пробел, выберите место стрелками вверх и вниз и снова нажмите пробел. Escape отменяет перестановку.",
};

export function ListRows({ lists }: { lists: ListSummary[] }) {
  const [items, setItems] = useState(lists);
  const [seenLists, setSeenLists] = useState(lists);
  if (seenLists !== lists) {
    setSeenLists(lists);
    setItems(lists);
  }
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const dndId = useId();
  // A pointer drag ends with a click on the row it started from, even after
  // Escape; it is swallowed until the next press. Keyboard clicks have
  // detail 0 and always pass.
  const pointerDragged = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: LONG_PRESS_DELAY_MS,
        tolerance: LONG_PRESS_MOVE_TOLERANCE_PX,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    }),
  );

  if (items.length === 0) return null;

  const nameOf = (id: UniqueIdentifier) =>
    items.find((l) => l.id === id)?.name ?? "";
  const placeOf = (id: UniqueIdentifier) =>
    `${items.findIndex((l) => l.id === id) + 1} из ${items.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Список «${nameOf(active.id)}» поднят.`,
    onDragOver: ({ active, over }) =>
      over
        ? `Список «${nameOf(active.id)}» на месте ${placeOf(over.id)}.`
        : `Список «${nameOf(active.id)}» вне перечня.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Список «${nameOf(active.id)}» поставлен на место ${placeOf(over.id)}.`
        : `Список «${nameOf(active.id)}» возвращён на место.`,
    onDragCancel: ({ active }) =>
      `Перестановка списка «${nameOf(active.id)}» отменена.`,
  };

  function onDragStart({ active, activatorEvent }: DragStartEvent) {
    setActiveId(active.id);
    pointerDragged.current = !(activatorEvent instanceof KeyboardEvent);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = items.findIndex((l) => l.id === active.id);
    const to = items.findIndex((l) => l.id === over.id);
    if (from < 0 || to < 0) return;
    const previous = items;
    const next = arrayMove(items, from, to);
    setItems(next);
    const listId = String(active.id);
    const afterId = to === 0 ? null : next[to - 1].id;
    startTransition(async () => {
      try {
        if ((await moveListAction(listId, afterId)).ok) return;
      } catch (error) {
        unstable_rethrow(error);
      }
      toast.error("Не удалось переставить список");
      setItems(previous);
      router.refresh();
    });
  }

  function onClickCapture(e: MouseEvent) {
    if (pointerDragged.current && e.detail > 0) {
      pointerDragged.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  const active = items.find((l) => l.id === activeId);

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      accessibility={{
        announcements,
        screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul
          onPointerDownCapture={() => {
            pointerDragged.current = false;
          }}
          onClickCapture={onClickCapture}
          className="mx-4 mt-2 overflow-hidden rounded-card bg-card"
        >
          {items.map((list, i) => (
            <SortableRow key={list.id} list={list} divider={i > 0} />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay>
        {active ? (
          <div
            className={cn(
              ROW_CLASS,
              "cursor-grabbing rounded-card bg-card shadow-menu",
            )}
          >
            <ListRowContent list={active} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableRow({ list, divider }: { list: ListSummary; divider: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        divider && "border-t border-row-line",
        isDragging && "opacity-0",
      )}
    >
      <Link
        href={`/lists/${list.id}`}
        draggable={false}
        aria-describedby={attributes["aria-describedby"]}
        {...listeners}
        className={cn(
          ROW_CLASS,
          LONG_PRESS_CLASS,
          "touch-manipulation hover-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        )}
      >
        <ListRowContent list={list} />
      </Link>
    </li>
  );
}

function ListRowContent({ list }: { list: ListSummary }) {
  return (
    <>
      <span className="flex items-center gap-2">
        <span className="min-w-0 truncate text-base font-semibold">
          {list.name}
        </span>
        {list.visibility === "private" ? <PrivateBadge /> : null}
        <span className="ml-auto flex-none text-sm text-ink-2 tabular-nums">
          {list.doneCount} из {list.totalCount}
        </span>
      </span>
      <ListProgress
        done={list.doneCount}
        total={list.totalCount}
        trackClassName="bg-page"
      />
    </>
  );
}
