import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { revalidateFor } from "./revalidate";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("revalidateFor", () => {
  it.each([
    ["expense", ["/", "/history", "/accounts"]],
    ["category", ["/", "/history"]],
    ["displayCurrency", ["/", "/history", "/accounts"]],
    ["invite", ["/settings"]],
    ["list", ["/lists"]],
    ["account", ["/accounts", "/", "/history"]],
    ["topUp", ["/accounts"]],
    ["transfer", ["/accounts"]],
  ] as const)("%s revalidates %j", (event, paths) => {
    revalidateFor(event);
    const pages = vi
      .mocked(revalidatePath)
      .mock.calls.filter((call) => call.length === 1)
      .map(([path]) => path);
    expect(pages.sort()).toEqual([...paths].sort());
  });

  it.each(["expense", "account", "displayCurrency", "category", "topUp", "transfer"] as const)(
    "%s revalidates the account page",
    (event) => {
      revalidateFor(event);
      expect(revalidatePath).toHaveBeenCalledWith("/accounts/[id]", "page");
    },
  );

  it.each(["list", "invite"] as const)("%s leaves the account page alone", (event) => {
    revalidateFor(event);
    expect(revalidatePath).not.toHaveBeenCalledWith("/accounts/[id]", "page");
  });
});
