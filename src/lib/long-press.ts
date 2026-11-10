export const LONG_PRESS_DELAY_MS = 500;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export type LongPressController = {
  pointerDown(x: number, y: number, isPrimary?: boolean): void;
  pointerMove(x: number, y: number): void;
  pointerUp(): void;
  pointerLeave(): void;
  pointerCancel(): void;
  consumeClick(fromPointer?: boolean): boolean;
  contextMenu(): void;
  dispose(): void;
};

export function createLongPress(onLongPress: () => void): LongPressController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let fired = false;
  let swallowClick = false;

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function fire() {
    timer = null;
    fired = true;
    swallowClick = true;
    onLongPress();
  }

  return {
    pointerDown(x, y, isPrimary = true) {
      cancel();
      fired = false;
      swallowClick = false;
      if (!isPrimary) return;
      startX = x;
      startY = y;
      timer = setTimeout(fire, LONG_PRESS_DELAY_MS);
    },
    pointerMove(x, y) {
      if (timer === null) return;
      if (Math.hypot(x - startX, y - startY) > LONG_PRESS_MOVE_TOLERANCE_PX) {
        cancel();
      }
    },
    pointerUp: cancel,
    pointerLeave: cancel,
    pointerCancel: cancel,
    consumeClick(fromPointer = true) {
      const swallow = swallowClick && fromPointer;
      swallowClick = false;
      return swallow;
    },
    contextMenu() {
      cancel();
      if (!fired) onLongPress();
    },
    dispose: cancel,
  };
}
