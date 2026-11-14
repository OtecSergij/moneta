import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { requireSpace, userNow } from "@/lib/dal";
import { isUuid } from "@/lib/actions/types";
import { getAccount, listAccountOptions } from "@/repositories/accounts";
import { listCategories } from "@/repositories/categories";
import { listExpenses } from "@/repositories/expenses";
import { listTopUps } from "@/repositories/top-ups";
import { listAccountTransfers } from "@/repositories/transfers";
import { getUserSettings } from "@/repositories/user-settings";
import { ensureRates, loadRateIndex } from "@/repositories/fx-rates";
import { CURRENCY_CODES } from "@/lib/currency";
import { maxEntryDate } from "@/lib/fx/provider";
import { rateSnapshot } from "@/lib/fx/convert";
import { todayISO } from "@/lib/dates";
import { toDayGroups } from "@/lib/day-groups";
import { buildAccountDays } from "@/lib/account-days";
import { balanceInDisplay } from "@/lib/accounts-total";
import { AppScreen } from "@/components/layout/app-screen";
import { AccountScreen } from "@/components/accounts/account-screen";

type Props = { params: Promise<{ id: string }> };

const loadAccount = cache(async (id: string) => {
  if (!isUuid(id)) notFound();
  const { spaceId } = await requireSpace();
  return (await getAccount(spaceId, id)) ?? notFound();
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const account = await loadAccount((await params).id);
  return { title: `${account.name} — moneta` };
}

export default async function AccountPage({ params }: Props) {
  const account = await loadAccount((await params).id);
  const { user, spaceId } = await requireSpace();
  const now = await userNow();
  const today = todayISO(now);

  // Bounded by maxEntryDate() like the home page: rows can be dated a day
  // ahead of this server, and the balance still takes the rate for today.
  const [settings, categories, accounts, rateIndex] = await Promise.all([
    getUserSettings(user.id),
    listCategories(spaceId),
    listAccountOptions(spaceId),
    loadRateIndex([...CURRENCY_CODES], maxEntryDate()),
  ]);
  const displayCurrency = settings.displayCurrency;

  const [expenses, topUps, transfers] = await Promise.all([
    listExpenses(spaceId, displayCurrency, { accountId: account.id }, rateIndex),
    listTopUps(spaceId, account.id),
    listAccountTransfers(spaceId, account.id),
  ]);
  const days = toDayGroups(
    buildAccountDays(expenses, topUps, transfers, displayCurrency, rateIndex),
    now,
  );

  after(() => ensureRates(today));

  return (
    <AppScreen tab="accounts">
      <AccountScreen
        account={{
          id: account.id,
          name: account.name,
          currency: account.currency,
          color: account.color,
          balanceMinor: account.balanceMinor,
          expenseCount: account.expenseCount,
        }}
        convertedMinor={balanceInDisplay(
          account,
          displayCurrency,
          rateIndex,
          today,
        )}
        days={days}
        categories={categories}
        accounts={accounts}
        displayCurrency={displayCurrency}
        rates={rateSnapshot(rateIndex, today)}
        today={today}
      />
    </AppScreen>
  );
}
