"use client";

import {
  useEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createLongPress, type LongPressController } from "@/lib/long-press";

export const LONG_PRESS_CLASS = "select-none [-webkit-touch-callout:none]";

const enabled = (e: { currentTarget: HTMLElement }) =>
  !e.currentTarget.matches(":disabled");

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
        e.isPrimary && e.button === 0 && enabled(e),
      ),
    onPointerMove: (e: PointerEvent<HTMLElement>) =>
      controller().pointerMove(e.clientX, e.clientY),
    onPointerUp: () => controller().pointerUp(),
    onPointerLeave: () => controller().pointerLeave(),
    onPointerCancel: () => controller().pointerCancel(),
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      controller().contextMenu(enabled(e));
    },
    onKeyDownCapture: () => controller().keyDown(),
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      if (controller().consumeClick()) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
