import { describe, expect, it } from "vitest";
import {
  type ConversionPreview,
  resolveFixationSlot,
} from "@/lib/fixation-slot";

const value: ConversionPreview = {
  status: "value",
  convertedMinor: 85867,
  displayCurrency: "RUB",
};

describe("resolveFixationSlot", () => {
  it("hides the slot until the amount holds a positive number", () => {
    for (const currenciesDiffer of [true, false]) {
      for (const panelOpen of [true, false]) {
        expect(
          resolveFixationSlot({
            currenciesDiffer,
            panelOpen,
            preview: { status: "empty" },
          }),
        ).toEqual({ kind: "hidden" });
      }
    }
  });

  it("offers the conversion preview as the way in when the currencies differ", () => {
    expect(
      resolveFixationSlot({
        currenciesDiffer: true,
        panelOpen: false,
        preview: value,
      }),
    ).toEqual({ kind: "preview-action", preview: value });
  });

  it("offers an explicit prompt when the currencies match", () => {
    expect(
      resolveFixationSlot({
        currenciesDiffer: false,
        panelOpen: false,
        preview: value,
      }),
    ).toEqual({ kind: "prompt" });
  });

  it("keeps reporting the conversion, without a tap target, while the panel is open", () => {
    expect(
      resolveFixationSlot({
        currenciesDiffer: true,
        panelOpen: true,
        preview: value,
      }),
    ).toEqual({ kind: "preview-status", preview: value });
  });

  it("hides the slot once the panel is open and the currencies match", () => {
    expect(
      resolveFixationSlot({
        currenciesDiffer: false,
        panelOpen: true,
        preview: value,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("carries the pending and unavailable quotes through unchanged", () => {
    const pending = { status: "pending" } as const;
    const unavailable = { status: "unavailable" } as const;

    expect(
      resolveFixationSlot({
        currenciesDiffer: true,
        panelOpen: false,
        preview: pending,
      }),
    ).toEqual({ kind: "preview-action", preview: pending });
    expect(
      resolveFixationSlot({
        currenciesDiffer: true,
        panelOpen: false,
        preview: unavailable,
      }),
    ).toEqual({ kind: "preview-action", preview: unavailable });
    expect(
      resolveFixationSlot({
        currenciesDiffer: true,
        panelOpen: true,
        preview: unavailable,
      }),
    ).toEqual({ kind: "preview-status", preview: unavailable });
  });

  it("prompts regardless of a stale quote once the currencies match", () => {
    // A quote resolved just before the user switched the entry currency to
    // the display currency must not keep the identity conversion on screen.
    expect(
      resolveFixationSlot({
        currenciesDiffer: false,
        panelOpen: false,
        preview: { status: "unavailable" },
      }),
    ).toEqual({ kind: "prompt" });
  });
});
