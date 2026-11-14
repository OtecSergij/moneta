import type { KeyboardEvent } from "react";

export function onEnterKey(
  e: KeyboardEvent,
  onEnter: () => void,
  onEscape?: () => void,
) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
    e.preventDefault();
    onEnter();
  } else if (onEscape && e.key === "Escape") {
    e.preventDefault();
    onEscape();
  }
}
