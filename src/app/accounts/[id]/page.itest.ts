import type { ComponentProps, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { maxEntryDate } from "@/lib/fx/provider";
import { todayISO } from "@/lib/dates";
import { deleteAccount } from "@/repositories/accounts";
import { setDisplayCurrency } from "@/repositories/user-settings";
import {
  clearRates,
  mkAccount,
  mkExpense,
  mkRate,
  mkSpaceUser,
  mkTopUp,
  mkTransfer,
} from "@/test/factories";
import { session } from "@/test/session-mock";
import type { AccountScreen } from "@/components/accounts/account-screen";

vi.mock("@/lib/dal", () => import("@/test/session-mock"));

import AccountPage from "./page";

async function screenProps(id: string): Promise<ComponentProps<typeof AccountScreen>> {
  const page = await AccountPage({ params: Promise.resolve({ id }) });
  return (page.props as { children: ReactElement<ComponentProps<typeof AccountScreen>> })
    .children.props;
}

beforeEach(clearRates);

describe("account page", () => {
  it("lists only this account's entries and converts the balance at today's rate", async () => {
    const me = await mkSpaceUser();
    session.current = { userId: me.user.id, spaceId: me.spaceId };
    await setDisplayCurrency(me.user.id, "USD");
    const today = todayISO();
    const tomorrow = maxEntryDate();
    for (const date of [today, tomorrow]) {
      await mkRate({ currency: "USD", effectiveDate: date });
    }
    await mkRate({ currency: "EUR", effectiveDate: today, rateToUsd: "1.1" });
    await mkRate({ currency: "EUR", effectiveDate: tomorrow, rateToUsd: "1.2" });

    const account = await mkAccount(me.spaceId, me.user.id, {
      currency: "EUR",
      anchorAmountMinor: 10_000,
    });
    const mine = await mkExpense(me.spaceId, me.user.id, {
      currency: "EUR",
      accountId: account.id,
      amountMinor: 1000,
      spentAt: tomorrow,
    });
    await mkExpense(me.spaceId, me.user.id, { currency: "RUB", spentAt: today });
    const topUp = await mkTopUp(me.spaceId, me.user.id, {
      accountId: account.id,
      amountMinor: 500,
      occurredOn: today,
    });
    const other = await mkAccount(me.spaceId, me.user.id);
    await mkTopUp(me.spaceId, me.user.id, { accountId: other.id, occurredOn: today });

    const props = await screenProps(account.id);

    expect(props.account.balanceMinor).toBe(9500);
    expect(props.convertedMinor).toBe(10450);
    const items = props.days.flatMap((d) => d.items);
    expect(items).toHaveLength(2);
    expect(items).toEqual([
      {
        kind: "expense",
        expense: {
          id: mine.id,
          categoryId: mine.categoryId,
          accountId: account.id,
          amountMinor: 1000,
          currency: "EUR",
          note: mine.note,
          spentAt: tomorrow,
          convertedMinor: 1200,
          displayCurrency: "USD",
        },
      },
      {
        kind: "topUp",
        topUp: {
          id: topUp.id,
          amountMinor: 500,
          currency: "EUR",
          note: topUp.note,
          occurredOn: today,
          convertedMinor: 550,
          displayCurrency: "USD",
        },
      },
    ]);
    expect(props.categories).toContainEqual({
      id: mine.categoryId,
      name: expect.any(String),
      color: expect.any(String),
    });
    for (const category of props.categories) {
      expect(Object.keys(category).sort()).toEqual(["color", "id", "name"]);
    }
  });

  it("the transfer window gets the rates in force today, not tomorrow's", async () => {
    const me = await mkSpaceUser();
    session.current = { userId: me.user.id, spaceId: me.spaceId };
    const today = todayISO();
    await mkRate({ currency: "USD", effectiveDate: today });
    await mkRate({ currency: "EUR", effectiveDate: today, rateToUsd: "1.1" });
    await mkRate({ currency: "EUR", effectiveDate: maxEntryDate(), rateToUsd: "1.2" });
    const account = await mkAccount(me.spaceId, me.user.id);

    const props = await screenProps(account.id);

    expect(props.rates).toEqual({
      USD: "1.00000000000000000000",
      EUR: "1.10000000000000000000",
    });
    expect(props.today).toBe(today);
  });

  describe("transfers", () => {
    async function twoAccounts() {
      const me = await mkSpaceUser();
      session.current = { userId: me.user.id, spaceId: me.spaceId };
      await setDisplayCurrency(me.user.id, "USD");
      await mkRate({ currency: "USD", effectiveDate: todayISO() });
      await mkRate({ currency: "EUR", effectiveDate: todayISO(), rateToUsd: "1.1" });
      const card = await mkAccount(me.spaceId, me.user.id, {
        name: "Карта USD",
        currency: "USD",
      });
      const cash = await mkAccount(me.spaceId, me.user.id, {
        name: "Наличные EUR",
        currency: "EUR",
      });
      return { me, card, cash };
    }

    it("shows a transfer on both accounts' pages with each side's amount and the other account's name", async () => {
      const { me, card, cash } = await twoAccounts();
      const transfer = await mkTransfer(me.spaceId, me.user.id, {
        fromAccountId: card.id,
        toAccountId: cash.id,
        fromAmountMinor: 10_000,
        toAmountMinor: 9_200,
      });

      const cardItems = (await screenProps(card.id)).days.flatMap((d) => d.items);
      expect(cardItems).toEqual([
        {
          kind: "transfer",
          transfer: {
            id: transfer.id,
            side: "out",
            amountMinor: 10_000,
            currency: "USD",
            otherAccountName: "Наличные EUR",
            convertedMinor: 10_000,
            displayCurrency: "USD",
          },
        },
      ]);

      const cashItems = (await screenProps(cash.id)).days.flatMap((d) => d.items);
      expect(cashItems).toEqual([
        {
          kind: "transfer",
          transfer: {
            id: transfer.id,
            side: "in",
            amountMinor: 9_200,
            currency: "EUR",
            otherAccountName: "Карта USD",
            convertedMinor: 10_120,
            displayCurrency: "USD",
          },
        },
      ]);
    });

    it("a transfer whose other account is gone stays on the page without a name and with its amount", async () => {
      const { me, card, cash } = await twoAccounts();
      const transfer = await mkTransfer(me.spaceId, me.user.id, {
        fromAccountId: card.id,
        toAccountId: cash.id,
        fromAmountMinor: 10_000,
        toAmountMinor: 9_200,
      });
      expect((await deleteAccount(me.spaceId, cash.id)).ok).toBe(true);

      const items = (await screenProps(card.id)).days.flatMap((d) => d.items);
      expect(items).toEqual([
        {
          kind: "transfer",
          transfer: expect.objectContaining({
            id: transfer.id,
            side: "out",
            amountMinor: 10_000,
            otherAccountName: null,
          }),
        },
      ]);
    });

    it("a transfer does not change the day total", async () => {
      const { me, card, cash } = await twoAccounts();
      await mkExpense(me.spaceId, me.user.id, {
        currency: "USD",
        accountId: card.id,
        amountMinor: 1_000,
        spentAt: todayISO(),
      });
      await mkTransfer(me.spaceId, me.user.id, {
        fromAccountId: card.id,
        toAccountId: cash.id,
        fromAmountMinor: 10_000,
        toAmountMinor: 9_200,
      });
      await mkTransfer(me.spaceId, me.user.id, {
        fromAccountId: cash.id,
        toAccountId: card.id,
        fromAmountMinor: 4_600,
        toAmountMinor: 5_000,
      });

      const { days } = await screenProps(card.id);
      expect(days).toHaveLength(1);
      expect(days[0].items.map((i) => i.kind).sort()).toEqual([
        "expense",
        "transfer",
        "transfer",
      ]);
      expect(days[0].totalMinor).toBe(1_000);
      expect(days[0].unconverted).toBe(0);
    });
  });
});
