import { after } from "next/server";
import type { SpaceId } from "@/lib/space-id";
import { ensureRates, syncSpaceRates } from "@/repositories/fx-rates";

// Fills the rate snapshots after an expense, top-up or transfer write, once
// the response is sent, so a save never waits on a provider. Call it inside
// the action: after() needs the request. `date` is undefined when a patch
// leaves the date alone — skip that fill rather than guess which date to fill.
export function fillRatesAfterWrite(spaceId: SpaceId, date: string | undefined): void {
  after(async () => {
    if (date !== undefined) await ensureRates(date);
    // Unthrottled: this path knows state just changed, so it must converge
    // now rather than wait out the page path's quiet window.
    await syncSpaceRates(spaceId);
  });
}
