import { hashPassword } from "better-auth/crypto";
import { addDays, differenceInCalendarDays, startOfWeek, subDays } from "date-fns";
import { db } from "@/db";
import {
  account,
  categories,
  expenses,
  pendingSpaceJoins,
  spaceInvites,
  spaceMembers,
  spaces,
  user,
} from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { createCategory } from "@/repositories/categories";
import { createExpense, type ExpenseInput } from "@/repositories/expenses";
import { resolveSpace } from "@/repositories/spaces";

const SEED_EMAIL = "demo@moneta.test";
const SEED_PASSWORD = "moneta-demo-2026";
const SEED_NAME = "Демо";
const PARTNER_EMAIL = "anna@moneta.test";
const PARTNER_NAME = "Анна";

const CATEGORIES = [
  { key: "food", name: "Продукты", color: "#10B981" },
  { key: "cafe", name: "Кафе", color: "#F97316" },
  { key: "transport", name: "Транспорт", color: "#3B82F6" },
  { key: "home", name: "Дом", color: "#F59E0B" },
  { key: "health", name: "Здоровье", color: "#EC4899" },
  { key: "subscriptions", name: "Подписки", color: "#8B5CF6" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];
type Author = "owner" | "partner";

type SeedExpense = {
  category: CategoryKey;
  amountMinor: number;
  currency: ExpenseInput["currency"];
  note: string;
  by: Author;
};

const TODAY: SeedExpense[] = [
  { category: "cafe", amountMinor: 32000, currency: "RUB", note: "Капучино и круассан", by: "owner" },
  { category: "transport", amountMinor: 6400, currency: "RUB", note: "Метро", by: "partner" },
  { category: "subscriptions", amountMinor: 2000, currency: "USD", note: "ChatGPT Plus", by: "owner" },
];

// Cycled over the past days of the current week, two per day.
const THIS_WEEK: SeedExpense[] = [
  { category: "food", amountMinor: 248750, currency: "RUB", note: "Пятёрочка, продукты на неделю", by: "partner" },
  { category: "transport", amountMinor: 54000, currency: "RUB", note: "Такси до аэропорта", by: "owner" },
  { category: "cafe", amountMinor: 185000, currency: "RUB", note: "Ужин с друзьями", by: "owner" },
  { category: "subscriptions", amountMinor: 1199, currency: "EUR", note: "Spotify Premium", by: "partner" },
  { category: "home", amountMinor: 412000, currency: "RUB", note: "Коммуналка", by: "owner" },
  { category: "food", amountMinor: 96320, currency: "RUB", note: "ВкусВилл", by: "partner" },
  { category: "health", amountMinor: 138900, currency: "RUB", note: "Аптека", by: "partner" },
  { category: "cafe", amountMinor: 45000, currency: "RUB", note: "Бизнес-ланч", by: "owner" },
  { category: "home", amountMinor: 300000, currency: "RSD", note: "Хозтовары", by: "partner" },
  { category: "transport", amountMinor: 150000, currency: "RUB", note: "Пополнение Тройки", by: "owner" },
  { category: "food", amountMinor: 74210, currency: "RUB", note: "Рынок", by: "owner" },
  { category: "cafe", amountMinor: 27000, currency: "RUB", note: "Кофе с собой", by: "partner" },
];

// daysAgo >= 7 is always before this week's Monday.
const EARLIER: Array<SeedExpense & { daysAgo: number }> = [
  { category: "health", amountMinor: 350000, currency: "RUB", note: "Приём терапевта", by: "owner", daysAgo: 9 },
  { category: "home", amountMinor: 279000, currency: "RUB", note: "Икеа, полка и лампа", by: "partner", daysAgo: 12 },
  { category: "food", amountMinor: 312480, currency: "RUB", note: "Перекрёсток", by: "owner", daysAgo: 15 },
  { category: "cafe", amountMinor: 96000, currency: "RUB", note: "Завтрак в кафе", by: "partner", daysAgo: 19 },
  { category: "transport", amountMinor: 3500, currency: "EUR", note: "Поезд", by: "owner", daysAgo: 24 },
  { category: "subscriptions", amountMinor: 59900, currency: "RUB", note: "Яндекс Плюс", by: "partner", daysAgo: 30 },
  { category: "food", amountMinor: 187650, currency: "RUB", note: "Ашан", by: "owner", daysAgo: 37 },
];

async function reset() {
  await db.delete(expenses);
  await db.delete(categories);
  await db.delete(pendingSpaceJoins);
  await db.delete(spaceInvites);
  await db.delete(spaceMembers);
  await db.delete(spaces);
  await db.delete(user);
}

async function mkSeedUser(email: string, name: string, passwordHash: string) {
  const [row] = await db
    .insert(user)
    .values({ email, name, emailVerified: true })
    .returning();
  // Better Auth's email/password sign-up stores the credential account with
  // accountId = user id and providerId = "credential".
  await db.insert(account).values({
    userId: row.id,
    accountId: row.id,
    providerId: "credential",
    password: passwordHash,
  });
  return row;
}

async function main() {
  await reset();

  const passwordHash = await hashPassword(SEED_PASSWORD);
  const owner = await mkSeedUser(SEED_EMAIL, SEED_NAME, passwordHash);
  const partner = await mkSeedUser(PARTNER_EMAIL, PARTNER_NAME, passwordHash);

  const { spaceId } = await resolveSpace(owner.id);
  await db
    .insert(spaceMembers)
    .values({ spaceId, userId: partner.id, role: "member" });
  const authorId: Record<Author, string> = { owner: owner.id, partner: partner.id };

  const categoryIds = new Map<CategoryKey, string>();
  for (const { key, name, color } of CATEGORIES) {
    const category = await createCategory(spaceId, owner.id, { name, color });
    categoryIds.set(key, category.id);
  }

  const now = new Date();
  const planned: Array<SeedExpense & { day: Date }> = [];
  for (const e of EARLIER) planned.push({ ...e, day: subDays(now, e.daysAgo) });
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const pastDays = differenceInCalendarDays(now, monday);
  for (let i = 0; i < pastDays * 2; i++) {
    planned.push({
      ...THIS_WEEK[i % THIS_WEEK.length],
      day: addDays(monday, Math.floor(i / 2)),
    });
  }
  for (const e of TODAY) planned.push({ ...e, day: now });

  for (const e of planned) {
    const row = await createExpense(spaceId, authorId[e.by], {
      categoryId: categoryIds.get(e.category)!,
      amountMinor: e.amountMinor,
      currency: e.currency,
      note: e.note,
      spentAt: todayISO(e.day),
    });
    if (!row) throw new Error(`createExpense rejected: ${e.note}`);
  }

  console.log(
    `Seeded ${SEED_EMAIL} + ${PARTNER_EMAIL} in one space: ${CATEGORIES.length} categories, ${planned.length} expenses`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
