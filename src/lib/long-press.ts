export const LONG_PRESS_DELAY_MS = 500;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
export const CLICK_SWALLOW_WINDOW_MS = 400;

export type LongPressController = {
  pointerDown(x: number, y: number, isPrimary?: boolean): void;
  pointerMove(x: number, y: number): void;
  pointerUp(): void;
  pointerLeave(): void;
  pointerCancel(): void;
  consumeClick(): boolean;
  keyDown(): void;
  contextMenu(): void;
  dispose(): void;
};

export function createLongPress(onLongPress: () => void): LongPressController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let fired = false;
  let swallowClick = false;
  let disarmTimer: ReturnType<typeof setTimeout> | null = null;

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function disarm() {
    swallowClick = false;
    if (disarmTimer !== null) {
      clearTimeout(disarmTimer);
      disarmTimer = null;
    }
  }

  // The click that follows the gesture arrives right after pointerup. If it
  // lands elsewhere (an overlay mounted under the pointer), the flag must not
  // linger and eat a later, unrelated click.
  function end() {
    cancel();
    if (!swallowClick) return;
    if (disarmTimer !== null) clearTimeout(disarmTimer);
    disarmTimer = setTimeout(disarm, CLICK_SWALLOW_WINDOW_MS);
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
      disarm();
      fired = false;
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
    pointerUp: end,
    pointerLeave: end,
    pointerCancel: end,
    consumeClick() {
      const swallow = swallowClick;
      disarm();
      return swallow;
    },
    keyDown: disarm,
    contextMenu() {
      cancel();
      if (!fired) onLongPress();
    },
    dispose() {
      cancel();
      disarm();
    },
  };
}
