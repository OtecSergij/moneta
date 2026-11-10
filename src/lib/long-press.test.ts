import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLongPress } from "./long-press";

describe("createLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const onLongPress = vi.fn();
    return { onLongPress, lp: createLongPress(onLongPress) };
  }

  it("fires after 500ms of holding", () => {
    const { onLongPress, lp } = setup();
    lp.pointerDown(0, 0);
    vi.advanceTimersByTime(499);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("is cancelled by moving more than 10px", () => {
    const { onLongPress, lp } = setup();
    lp.pointerDown(0, 0);
    lp.pointerMove(6, 6);
    vi.advanceTimersByTime(200);
    lp.pointerMove(8, 8);
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("tolerates a move within 10px", () => {
    const { onLongPress, lp } = setup();
    lp.pointerDown(0, 0);
    lp.pointerMove(6, 8);
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it.each(["pointerUp", "pointerLeave", "pointerCancel"] as const)(
    "is cancelled by %s",
    (event) => {
      const { onLongPress, lp } = setup();
      lp.pointerDown(0, 0);
      vi.advanceTimersByTime(300);
      lp[event]();
      vi.advanceTimersByTime(500);
      expect(onLongPress).not.toHaveBeenCalled();
    },
  );

  it("does not start for a non-primary button", () => {
    const { onLongPress, lp } = setup();
    lp.pointerDown(0, 0, false);
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("swallows only the next click after firing", () => {
    const { lp } = setup();
    lp.pointerDown(0, 0);
    vi.advanceTimersByTime(500);
    lp.pointerUp();
    expect(lp.consumeClick()).toBe(true);
    expect(lp.consumeClick()).toBe(false);
  });

  it("does not swallow a keyboard click after a gesture whose click was lost", () => {
    const { lp } = setup();
    lp.pointerDown(0, 0);
    vi.advanceTimersByTime(500);
    lp.pointerUp();
    expect(lp.consumeClick(false)).toBe(false);
    expect(lp.consumeClick()).toBe(false);
  });

  it("does not swallow a regular tap", () => {
    const { lp } = setup();
    lp.pointerDown(0, 0);
    vi.advanceTimersByTime(100);
    lp.pointerUp();
    expect(lp.consumeClick()).toBe(false);
  });

  it("opens on contextmenu without a timer", () => {
    const { onLongPress, lp } = setup();
    lp.contextMenu();
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("opens on contextmenu during a hold and cancels the timer", () => {
    const { onLongPress, lp } = setup();
    lp.pointerDown(0, 0);
    vi.advanceTimersByTime(300);
    lp.contextMenu();
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("does not open again on contextmenu after the timer fired", () => {
    const { onLongPress, lp } = setup();
    lp.pointerDown(0, 0);
    vi.advanceTimersByTime(500);
    lp.contextMenu();
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("opens on contextmenu again in the next gesture", () => {
    const { onLongPress, lp } = setup();
    lp.pointerDown(0, 0);
    vi.advanceTimersByTime(500);
    lp.pointerUp();
    lp.pointerDown(0, 0, false);
    lp.contextMenu();
    expect(onLongPress).toHaveBeenCalledTimes(2);
  });
});
