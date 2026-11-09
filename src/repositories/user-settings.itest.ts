import { describe, expect, it } from "vitest";
import {
  getUserSettings,
  setDisplayCurrency,
} from "@/repositories/user-settings";
import { mkUser } from "@/test/factories";

describe("user-settings repository", () => {
  it("returns the default display currency for a user with no settings row", async () => {
    const u = await mkUser();
    expect(await getUserSettings(u.id)).toEqual({ displayCurrency: "RUB" });
  });

  it("upserts — a second save overwrites the first", async () => {
    const u = await mkUser();
    await setDisplayCurrency(u.id, "USD");
    const stored = await setDisplayCurrency(u.id, "RSD");
    expect(stored).toBe("RSD");
    expect(await getUserSettings(u.id)).toEqual({ displayCurrency: "RSD" });
  });

  it("isolates settings per user", async () => {
    const a = await mkUser();
    const b = await mkUser();
    await setDisplayCurrency(a.id, "EUR");

    expect(await getUserSettings(a.id)).toEqual({ displayCurrency: "EUR" });
    expect(await getUserSettings(b.id)).toEqual({ displayCurrency: "RUB" });
  });
});
