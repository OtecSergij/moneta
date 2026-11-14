import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceId } from "@/lib/space-id";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/repositories/fx-rates", () => ({
  ensureRates: vi.fn(async () => true),
  syncSpaceRates: vi.fn(async () => {}),
}));

import { after } from "next/server";
import { ensureRates, syncSpaceRates } from "@/repositories/fx-rates";
import { fillRatesAfterWrite } from "./entry-rates";

const spaceId = "7b793000-3abc-4865-b3c6-bf1b9a3de4db" as SpaceId;

async function runScheduled(): Promise<void> {
  expect(after).toHaveBeenCalledTimes(1);
  await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fillRatesAfterWrite", () => {
  it("fetches nothing before the response is sent", () => {
    fillRatesAfterWrite(spaceId, "2024-11-01");

    expect(ensureRates).not.toHaveBeenCalled();
    expect(syncSpaceRates).not.toHaveBeenCalled();
  });

  it("fills the entry's date, then syncs the space without a throttle", async () => {
    fillRatesAfterWrite(spaceId, "2024-11-01");
    await runScheduled();

    expect(vi.mocked(ensureRates).mock.calls).toEqual([["2024-11-01"]]);
    expect(vi.mocked(syncSpaceRates).mock.calls).toEqual([[spaceId]]);
    expect(vi.mocked(ensureRates).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(syncSpaceRates).mock.invocationCallOrder[0],
    );
  });

  it("a patch that leaves the date alone only syncs the space", async () => {
    fillRatesAfterWrite(spaceId, undefined);
    await runScheduled();

    expect(ensureRates).not.toHaveBeenCalled();
    expect(vi.mocked(syncSpaceRates).mock.calls).toEqual([[spaceId]]);
  });
});
