import { describe, expect, it } from "vitest";
import { getUserSettings, setSalaryDays } from "@/repositories/user-settings";
import { mkUser } from "@/test/factories";

describe("user-settings repository", () => {
  it("returns empty salary days for a user with no settings row", async () => {
    const u = await mkUser();
    expect(await getUserSettings(u.id)).toEqual({ salaryDays: [] });
  });

  it("persists and reads back salary days", async () => {
    const u = await mkUser();
    await setSalaryDays(u.id, [3, 17]);
    expect(await getUserSettings(u.id)).toEqual({ salaryDays: [3, 17] });
  });

  it("upserts — a second save overwrites the first", async () => {
    const u = await mkUser();
    await setSalaryDays(u.id, [3, 17]);
    const stored = await setSalaryDays(u.id, [10]);
    expect(stored).toEqual([10]);
    expect(await getUserSettings(u.id)).toEqual({ salaryDays: [10] });
  });

  it("clearing to an empty list is allowed", async () => {
    const u = await mkUser();
    await setSalaryDays(u.id, [5]);
    await setSalaryDays(u.id, []);
    expect(await getUserSettings(u.id)).toEqual({ salaryDays: [] });
  });

  it("isolates settings per user", async () => {
    const a = await mkUser();
    const b = await mkUser();
    await setSalaryDays(a.id, [1, 15]);

    expect(await getUserSettings(a.id)).toEqual({ salaryDays: [1, 15] });
    expect(await getUserSettings(b.id)).toEqual({ salaryDays: [] });
  });
});
