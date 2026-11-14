import type { Metadata } from "next";
import { after } from "next/server";
import { requireSpace, userNow } from "@/lib/dal";
import { listAccounts } from "@/repositories/accounts";
import { getUserSettings } from "@/repositories/user-settings";
import { ensureRates, loadRatesOn } from "@/repositories/fx-rates";
import { CURRENCY_CODES } from "@/lib/currency";
import { todayISO } from "@/lib/dates";
import { summarizeAccounts } from "@/lib/accounts-total";
import { AppScreen } from "@/components/layout/app-screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { AccountNewButton } from "@/components/accounts/account-new-sheet";
import { AccountsTotal } from "@/components/accounts/accounts-total";
import { AccountRows } from "@/components/accounts/account-rows";

export const metadata: Metadata = { title: "Счета — moneta" };

export default async function AccountsPage() {
  const { user, spaceId } = await requireSpace();
  const today = todayISO(await userNow());
  const [settings, accounts, rateIndex] = await Promise.all([
    getUserSettings(user.id),
    listAccounts(spaceId),
    loadRatesOn([...CURRENCY_CODES], today),
  ]);
  const displayCurrency = settings.displayCurrency;
  const summary = summarizeAccounts(
    accounts.map(({ id, name, currency, color, balanceMinor }) => ({
      id,
      name,
      currency,
      color,
      balanceMinor,
    })),
    displayCurrency,
    rateIndex,
    today,
  );

  after(() => ensureRates(today));

  return (
    <AppScreen tab="accounts">
      <ScreenHeader
        title="Счета"
        displayCurrency={displayCurrency}
        action={
          <AccountNewButton
            displayCurrency={displayCurrency}
            usedColors={accounts.map((a) => a.color)}
          />
        }
      />
      {summary.rows.length > 0 ? (
        <>
          <AccountsTotal summary={summary} currency={displayCurrency} />
          <AccountRows rows={summary.rows} displayCurrency={displayCurrency} />
        </>
      ) : null}
    </AppScreen>
  );
}
