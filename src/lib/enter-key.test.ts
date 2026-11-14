import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { onEnterKey } from "./enter-key";

function keyDown(key: string, isComposing = false) {
  const e = { key, nativeEvent: { isComposing }, preventDefault: vi.fn() };
  return e as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

describe("onEnterKey", () => {
  it("runs onEnter on Enter and keeps the key from the form", () => {
    const onEnter = vi.fn();
    const e = keyDown("Enter");
    onEnterKey(e, onEnter);
    expect(onEnter).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves Enter alone while an input method composes", () => {
    const onEnter = vi.fn();
    const e = keyDown("Enter", true);
    onEnterKey(e, onEnter);
    expect(onEnter).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("runs onEscape on Escape when given", () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    const e = keyDown("Escape");
    onEnterKey(e, onEnter, onEscape);
    expect(onEscape).toHaveBeenCalledOnce();
    expect(onEnter).not.toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it("lets Escape through without onEscape, so a sheet can close", () => {
    const onEnter = vi.fn();
    const e = keyDown("Escape");
    onEnterKey(e, onEnter);
    expect(onEnter).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    const e = keyDown("a");
    onEnterKey(e, onEnter, onEscape);
    expect(onEnter).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
