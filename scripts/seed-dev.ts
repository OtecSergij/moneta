import { hashPassword } from "better-auth/crypto";
import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  setHours,
  startOfDay,
  startOfWeek,
  subDays,
  subSeconds,
} from "date-fns";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  account,
  accounts,
  categories,
  expenses,
  listItems,
  lists,
  pendingSpaceJoins,
  spaceInvites,
  spaceMembers,
  spaces,
  user,
} from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { createAccount, listAccounts } from "@/repositories/accounts";
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
  { category: "food", amountMinor: 120000, currency: "RSD", note: "Рынок в Белграде", by: "partner", daysAgo: 11 },
  { category: "home", amountMinor: 279000, currency: "RUB", note: "Икеа, полка и лампа", by: "partner", daysAgo: 12 },
  { category: "food", amountMinor: 312480, currency: "RUB", note: "Перекрёсток", by: "owner", daysAgo: 15 },
  { category: "cafe", amountMinor: 96000, currency: "RUB", note: "Завтрак в кафе", by: "partner", daysAgo: 19 },
  { category: "transport", amountMinor: 3500, currency: "EUR", note: "Поезд", by: "owner", daysAgo: 24 },
  { category: "subscriptions", amountMinor: 59900, currency: "RUB", note: "Яндекс Плюс", by: "partner", daysAgo: 30 },
  { category: "food", amountMinor: 187650, currency: "RUB", note: "Ашан", by: "owner", daysAgo: 37 },
];

// Inserted in this order: created_at ascending follows the canvas chips.
// Expenses in an account's currency are charged to it. The anchor is set
// `anchorDaysAgo` back and sized so the computed balance lands on
// `balanceMinor` (the canvas value); the 24-day-old EUR train ticket sits
// before its account's anchor and doesn't count.
const ACCOUNTS: Array<{
  name: string;
  currency: ExpenseInput["currency"];
  balanceMinor: number;
  anchorDaysAgo: number;
}> = [
  { name: "Карта USD", currency: "USD", balanceMinor: 124050, anchorDaysAgo: 1 },
  { name: "Наличные EUR", currency: "EUR", balanceMinor: 62000, anchorDaysAgo: 10 },
  { name: "Наличные RSD", currency: "RSD", balanceMinor: 4830000, anchorDaysAgo: 20 },
  { name: "Карта RUB", currency: "RUB", balanceMinor: 8642000, anchorDaysAgo: 5 },
];

const LISTS: Array<{ name: string; done: string[]; todo: string[]; isPrivate?: true; by: Author }> = [
  {
    name: "Продукты на неделю",
    by: "partner",
    done: ["Молоко", "Хлеб", "Яйца", "Сыр", "Бананы"],
    todo: ["Курица", "Гречка", "Помидоры", "Огурцы", "Йогурт", "Кофе", "Овсянка"],
  },
  {
    name: "Подарки на Новый год",
    by: "owner",
    isPrivate: true,
    done: ["Маме — шарф", "Папе — книга"],
    todo: ["Анне — духи", "Брату — наушники", "Бабушке — плед", "Коллегам — чай", "Открытки"],
  },
  {
    name: "Аптечка",
    by: "owner",
    done: ["Пластыри"],
    todo: ["Ибупрофен", "Бинт", "Термометр"],
  },
  {
    name: "Дом: хозтовары",
    by: "partner",
    done: [],
    todo: ["Губки", "Средство для посуды", "Мешки для мусора", "Бумажные полотенца", "Стиральный порошок", "Лампочки"],
  },
  {
    name: "Перед поездкой",
    by: "owner",
    done: ["Паспорт", "Билеты", "Страховка", "Зарядки", "Адаптер", "Аптечка", "Наличные", "Бронь отеля", "Полить цветы"],
    todo: [],
  },
];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// reset() wipes every user, so refuse anything that isn't a local dev database.
function assertLocalDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed-dev refuses to run with NODE_ENV=production");
  }
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`seed-dev refuses to wipe a non-local database (host "${host}")`);
  }
}

async function reset() {
  await db.delete(accounts);
  await db.delete(listItems);
  await db.delete(lists);
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
  assertLocalDatabase();
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
  const accountIds = new Map<ExpenseInput["currency"], string>();
  for (const [i, a] of ACCOUNTS.entries()) {
    const created = await createAccount(spaceId, owner.id, a);
    await db
      .update(accounts)
      .set({ createdAt: addMinutes(subDays(now, 40), i) })
      .where(eq(accounts.id, created.id));
    accountIds.set(a.currency, created.id);
  }

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

  const charged = new Map<string, Array<{ amountMinor: number; createdAt: Date }>>();
  for (const [i, e] of planned.entries()) {
    const accountId = accountIds.get(e.currency)!;
    const row = await createExpense(spaceId, authorId[e.by], {
      categoryId: categoryIds.get(e.category)!,
      amountMinor: e.amountMinor,
      currency: e.currency,
      note: e.note,
      spentAt: todayISO(e.day),
      accountId,
    });
    if (!row) throw new Error(`createExpense rejected: ${e.note}`);
    // Recorded on the day it was spent; today's entries stay in the past.
    const onDay = addMinutes(setHours(startOfDay(e.day), 9), i);
    const createdAt = onDay < now ? onDay : subSeconds(now, planned.length - i);
    await db.update(expenses).set({ createdAt }).where(eq(expenses.id, row.id));
    charged.set(accountId, [...(charged.get(accountId) ?? []), { amountMinor: e.amountMinor, createdAt }]);
  }

  for (const a of ACCOUNTS) {
    const id = accountIds.get(a.currency)!;
    const anchorAt = subDays(now, a.anchorDaysAgo);
    const spentAfter = (charged.get(id) ?? [])
      .filter((c) => c.createdAt > anchorAt)
      .reduce((sum, c) => sum + c.amountMinor, 0);
    await db
      .update(accounts)
      .set({ anchorAmountMinor: a.balanceMinor + spentAfter, anchorAt })
      .where(eq(accounts.id, id));
  }
  for (const listed of await listAccounts(spaceId)) {
    const expected = ACCOUNTS.find((a) => a.currency === listed.currency)!.balanceMinor;
    if (listed.balanceMinor !== expected) {
      throw new Error(`${listed.name}: balance ${listed.balanceMinor}, expected ${expected}`);
    }
  }

  // Inserted oldest first so the list order on screen follows LISTS.
  for (const l of [...LISTS].reverse()) {
    const [list] = await db
      .insert(lists)
      .values({
        spaceId,
        createdBy: authorId[l.by],
        name: l.name,
        visibility: l.isPrivate ? "private" : "shared",
      })
      .returning();
    const items = [
      ...l.done.map((text) => ({ text, checked: true })),
      ...l.todo.map((text) => ({ text, checked: false })),
    ];
    // One insert per item: rows of a single insert share created_at, and the
    // screen orders items by it.
    for (const item of items) {
      await db
        .insert(listItems)
        .values({ ...item, listId: list.id, spaceId, createdBy: authorId[l.by] });
    }
  }

  console.log(
    `Seeded ${SEED_EMAIL} + ${PARTNER_EMAIL} in one space: ${CATEGORIES.length} categories, ${planned.length} expenses, ${LISTS.length} lists, ${ACCOUNTS.length} accounts`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
