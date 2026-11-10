import { describe, expect, it } from "vitest";
import { shouldDismiss } from "./sheet-gesture";

describe("shouldDismiss", () => {
  it("dismisses after dragging more than 80px", () => {
    expect(shouldDismiss(81, 0)).toBe(true);
    expect(shouldDismiss(80, 0)).toBe(false);
  });

  it("dismisses on a fast flick above 0.5 px/ms", () => {
    expect(shouldDismiss(20, 0.51)).toBe(true);
    expect(shouldDismiss(20, 0.5)).toBe(false);
  });

  it("keeps the sheet for a short slow drag or an upward drag", () => {
    expect(shouldDismiss(30, 0.2)).toBe(false);
    expect(shouldDismiss(-50, -1)).toBe(false);
  });
});
