"use client";

import {
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Dialog } from "radix-ui";
import { shouldDismiss } from "@/lib/sheet-gesture";
import { cn } from "@/lib/utils";

type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone?: "white" | "gray";
  compact?: boolean;
  className?: string;
  onOpenAutoFocus?: (event: Event) => void;
  children: ReactNode;
} & (
  | { title: string; ariaLabel?: undefined }
  | { ariaLabel: string; title?: undefined }
);

const TOP_GAP_PX = 24;

function subscribeViewport(onChange: () => void) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener("resize", onChange);
  vv.addEventListener("scroll", onChange);
  return () => {
    vv.removeEventListener("resize", onChange);
    vv.removeEventListener("scroll", onChange);
  };
}

function useVisualViewport() {
  const height = useSyncExternalStore(
    subscribeViewport,
    () => window.visualViewport?.height ?? null,
    () => null,
  );
  const bottom = useSyncExternalStore(
    subscribeViewport,
    () => {
      const vv = window.visualViewport;
      return vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    },
    () => 0,
  );
  return { height, bottom };
}

type Drag = { startY: number; lastY: number; lastT: number; vy: number };

export function BottomSheet({
  open,
  onOpenChange,
  tone = "white",
  compact = false,
  title,
  ariaLabel,
  className,
  onOpenAutoFocus,
  children,
}: BottomSheetProps) {
  const viewport = useVisualViewport();
  const [dragY, setDragY] = useState(0);
  const drag = useRef<Drag | null>(null);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      vy: 0,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vy = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragY(Math.max(0, e.clientY - d.startY));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const recent = e.timeStamp - d.lastT < 100 ? d.vy : 0;
    if (shouldDismiss(e.clientY - d.startY, recent)) onOpenChange(false);
    setDragY(0);
  }

  function onPointerCancel() {
    drag.current = null;
    setDragY(0);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[calc(100dvh-24px)] w-full max-w-[480px] flex-col rounded-t-sheet text-ink shadow-sheet outline-none",
            dragY === 0 && "transition-transform duration-200",
            tone === "white" ? "bg-card" : "bg-page",
          )}
          style={{
            bottom: viewport.bottom,
            maxHeight:
              viewport.height === null
                ? undefined
                : viewport.height - TOP_GAP_PX,
            transform: dragY ? `translateY(${dragY}px)` : undefined,
          }}
        >
          <div
            aria-hidden
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            className="flex h-6 flex-none cursor-grab touch-none justify-center pt-2"
          >
            <span className="h-[5px] w-9 rounded-chip bg-control-line" />
          </div>
          <div
            className={cn(
              "flex min-h-0 flex-col overflow-y-auto overscroll-contain",
              compact
                ? "gap-4 px-5 pt-[5px] pb-[calc(28px+env(safe-area-inset-bottom))]"
                : tone === "white"
                  ? "gap-5 px-5 pt-[9px] pb-[calc(32px+env(safe-area-inset-bottom))]"
                  : "gap-3 px-4 pt-px pb-[calc(32px+env(safe-area-inset-bottom))]",
              className,
            )}
          >
            {title ? (
              <Dialog.Title
                className={cn(
                  "text-xl/7 font-semibold",
                  tone === "gray" && "px-1",
                )}
              >
                {title}
              </Dialog.Title>
            ) : (
              <Dialog.Title className="sr-only">{ariaLabel}</Dialog.Title>
            )}
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
