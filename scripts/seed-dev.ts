import { hashPassword } from "better-auth/crypto";
import { subDays } from "date-fns";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account, expenses, user } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { createCategory } from "@/repositories/categories";
import { createExpense, type ExpenseInput } from "@/repositories/expenses";

const SEED_EMAIL = "demo@moneta.test";
const SEED_PASSWORD = "moneta-demo-2026";
const SEED_NAME = "Демо";

const CATEGORIES = [
  { key: "food", name: "Продукты", color: "#10B981" },
  { key: "cafe", name: "Кафе", color: "#F97316" },
  { key: "transport", name: "Транспорт", color: "#3B82F6" },
  { key: "subscriptions", name: "Подписки", color: "#8B5CF6" },
  { key: "home", name: "Дом", color: "#A16207" },
  { key: "health", name: "Здоровье", color: "#EC4899" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

const EXPENSES: Array<{
  category: CategoryKey;
  amountMinor: number;
  currency: ExpenseInput["currency"];
  note: string;
  daysAgo: number;
}> = [
  { category: "cafe", amountMinor: 32000, currency: "RUB", note: "Капучино и круассан", daysAgo: 0 },
  { category: "subscriptions", amountMinor: 2000, currency: "USD", note: "ChatGPT Plus", daysAgo: 0 },
  { category: "food", amountMinor: 248750, currency: "RUB", note: "Пятёрочка, продукты на неделю", daysAgo: 1 },
  { category: "transport", amountMinor: 6400, currency: "RUB", note: "Метро", daysAgo: 1 },
  { category: "cafe", amountMinor: 185000, currency: "RUB", note: "Ужин с друзьями", daysAgo: 3 },
  { category: "subscriptions", amountMinor: 1199, currency: "EUR", note: "Spotify Premium", daysAgo: 4 },
  { category: "transport", amountMinor: 54000, currency: "RUB", note: "Такси до аэропорта", daysAgo: 5 },
  { category: "home", amountMinor: 412000, currency: "RUB", note: "Коммуналка за октябрь", daysAgo: 6 },
  { category: "health", amountMinor: 138900, currency: "RUB", note: "Аптека", daysAgo: 8 },
  { category: "food", amountMinor: 96320, currency: "RUB", note: "ВкусВилл", daysAgo: 9 },
  { category: "cafe", amountMinor: 45000, currency: "RUB", note: "Бизнес-ланч", daysAgo: 12 },
  { category: "home", amountMinor: 279000, currency: "RUB", note: "Икеа, полка и лампа", daysAgo: 15 },
  { category: "transport", amountMinor: 150000, currency: "RUB", note: "Пополнение Тройки", daysAgo: 18 },
  { category: "food", amountMinor: 312480, currency: "RUB", note: "Перекрёсток", daysAgo: 22 },
  { category: "health", amountMinor: 350000, currency: "RUB", note: "Приём терапевта", daysAgo: 27 },
];

async function removeExistingSeedUser() {
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, SEED_EMAIL));
  if (!existing) return;

  // expenses → categories is ON DELETE RESTRICT, so expenses must go before
  // the user delete cascades into categories.
  await db.delete(expenses).where(eq(expenses.userId, existing.id));
  await db.delete(user).where(eq(user.id, existing.id));
}

async function main() {
  await removeExistingSeedUser();

  const [seedUser] = await db
    .insert(user)
    .values({ email: SEED_EMAIL, name: SEED_NAME, emailVerified: true })
    .returning();

  // Better Auth's email/password sign-up stores the credential account with
  // accountId = user id and providerId = "credential".
  await db.insert(account).values({
    userId: seedUser.id,
    accountId: seedUser.id,
    providerId: "credential",
    password: await hashPassword(SEED_PASSWORD),
  });

  const categoryIds = new Map<CategoryKey, string>();
  for (const { key, name, color } of CATEGORIES) {
    const category = await createCategory(seedUser.id, { name, color });
    categoryIds.set(key, category.id);
  }

  const now = new Date();
  for (const e of EXPENSES) {
    const row = await createExpense(seedUser.id, {
      categoryId: categoryIds.get(e.category)!,
      amountMinor: e.amountMinor,
      currency: e.currency,
      note: e.note,
      spentAt: todayISO(subDays(now, e.daysAgo)),
    });
    if (!row) throw new Error(`createExpense rejected: ${e.note}`);
  }

  console.log(
    `Seeded ${SEED_EMAIL}: ${CATEGORIES.length} categories, ${EXPENSES.length} expenses`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
