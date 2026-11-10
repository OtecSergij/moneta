"use client";

import {
  useEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createLongPress, type LongPressController } from "@/lib/long-press";

export const LONG_PRESS_CLASS = "select-none [-webkit-touch-callout:none]";

export function useLongPress(onLongPress: () => void) {
  const callbackRef = useRef(onLongPress);
  useEffect(() => {
    callbackRef.current = onLongPress;
  });

  const controllerRef = useRef<LongPressController | null>(null);
  useEffect(() => () => controllerRef.current?.dispose(), []);

  function controller() {
    controllerRef.current ??= createLongPress(() => callbackRef.current());
    return controllerRef.current;
  }

  return {
    className: LONG_PRESS_CLASS,
    onPointerDown: (e: PointerEvent<HTMLElement>) =>
      controller().pointerDown(
        e.clientX,
        e.clientY,
        e.isPrimary && e.button === 0,
      ),
    onPointerMove: (e: PointerEvent<HTMLElement>) =>
      controller().pointerMove(e.clientX, e.clientY),
    onPointerUp: () => controller().pointerUp(),
    onPointerLeave: () => controller().pointerLeave(),
    onPointerCancel: () => controller().pointerCancel(),
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      controller().contextMenu();
    },
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      // detail is 0 for keyboard and programmatic clicks, which follow no gesture.
      if (controller().consumeClick(e.detail > 0)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
