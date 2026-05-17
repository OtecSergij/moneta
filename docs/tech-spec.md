# moneta — техническая спека (MVP)

## 1. Высокоуровневая архитектура

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  Браузер / PWA          │         │  Supabase (managed)          │
│  (Next.js app, SSR+CSR) │ ──HTTP→ │  ├─ Postgres (БД + RLS)     │
│                         │  WS     │  ├─ Auth (magic link, JWT)  │
│  supabase-js SDK ───────┼─REST/RT─┤  └─ Edge Functions (нет MVP)│
└─────────────────────────┘         └──────────────────────────────┘
```

- Frontend — единственный исполняемый код, который мы пишем. Хостится на Vercel.
- Бэкенда «своего» нет: вся CRUD-логика — это запросы из браузера в Supabase
  через `@supabase/supabase-js`. Безопасность данных — на уровне Postgres
  Row-Level Security.
- Никаких Express/Prisma/REST-роутов с нашей стороны.

**Почему так:**

- Одно приложение, один пользователь, простая модель данных → отдельный бэкенд
  только умножает движущиеся части.
- Supabase RLS даёт безопасный прямой доступ из фронта (запросы JWT-подписаны,
  политики на стороне БД проверяют `auth.uid()`).
- Next.js Server Actions подключим, если/когда понадобится серверная логика
  (например, агрегаты, недоступные через `select`).

## 2. Стек

| Слой              | Выбор                                  | Зачем именно это                                              |
| ----------------- | -------------------------------------- | ------------------------------------------------------------- |
| Framework         | **Next.js 15** (App Router, Turbopack) | SSR + клиент, простой деплой на Vercel, типизированные routes |
| Язык              | **TypeScript** strict                  | Меньше ошибок на стыке БД ↔ UI                                |
| Стили             | **Tailwind CSS v4**                    | Утилитарный, быстрый, токены из MASTER.md ложатся в `@theme`  |
| Шрифт             | **Inter** via `next/font/google`       | Чистый, читаемый, tabular-nums                                |
| Иконки            | **lucide-react**                       | SVG, дерево tree-shake-ится                                   |
| БД + Auth         | **Supabase** (Postgres 15+)            | Managed, RLS, JS SDK, бесплатный tier                          |
| Доступ к БД       | **@supabase/supabase-js**              | Официальный клиент, типы из БД генерим                         |
| Формы             | **react-hook-form** + **zod**          | Стандарт, валидация типобезопасная                            |
| Серверные данные  | **@tanstack/react-query**              | Кэш, refetch, оптимистические апдейты                          |
| Тосты             | **sonner**                             | Минимальный API, ARIA-friendly                                |
| Дата-утилиты      | **date-fns** (только нужные функции)   | Меньше bundle, чем moment                                     |
| PWA               | **@ducanh2912/next-pwa** или ручной    | Service worker + manifest                                     |
| Линт              | **ESLint** + **Prettier**              | Дефолт от create-next-app                                     |
| Деплой frontend   | **Vercel**                             | Бесшовно с Next.js                                            |
| Деплой backend    | —                                      | Нет своего бэкенда                                            |

**Никаких** Redux/Zustand для MVP — состояние или серверное (React Query) или
форменное (RHF). Локальный UI-стейт — `useState`.

## 3. Структура проекта

```
moneta/
├─ src/
│  ├─ app/                       # Next.js App Router
│  │  ├─ layout.tsx              # корневой layout, Inter, Providers
│  │  ├─ page.tsx                # Главная (/)
│  │  ├─ history/
│  │  │  └─ page.tsx             # /history
│  │  ├─ settings/
│  │  │  └─ page.tsx             # /settings
│  │  ├─ login/
│  │  │  └─ page.tsx             # magic-link форма
│  │  ├─ auth/
│  │  │  └─ callback/
│  │  │     └─ route.ts          # обработчик magic-link редиректа
│  │  └─ globals.css             # Tailwind + дизайн-токены
│  ├─ components/
│  │  ├─ ui/                     # примитивы: Button, Input, Select, Modal, ...
│  │  ├─ forms/                  # ExpenseForm, CategoryForm
│  │  ├─ summary/                # TotalCard, CategoryBars
│  │  └─ list/                   # ExpensesList, DayGroup
│  ├─ lib/
│  │  ├─ supabase/
│  │  │  ├─ client.ts            # createBrowserClient
│  │  │  ├─ server.ts            # createServerClient (для Server Components)
│  │  │  └─ types.ts             # generated DB types (`supabase gen types`)
│  │  ├─ money.ts                # форматтер RUB, tabular helper, parse
│  │  ├─ dates.ts                # date-fns обёртки + presets
│  │  └─ validation.ts           # zod схемы expense / category
│  └─ hooks/
│     ├─ useExpenses.ts          # React Query: list, create, update, delete
│     ├─ useCategories.ts
│     └─ useSummary.ts           # агрегаты на клиенте
├─ supabase/
│  ├─ migrations/                # SQL миграции (Supabase CLI)
│  │  └─ 20260517_init.sql       # tables + RLS + policies
│  └─ config.toml                # supabase init
├─ design-system/moneta/
│  ├─ MASTER.md                  # источник правды по UI
│  └─ pages/                     # page-specific overrides (пусто на старте)
├─ docs/
│  ├─ business-spec.md
│  └─ tech-spec.md
├─ public/
│  ├─ icon-192.png, icon-512.png # для PWA-манифеста
│  └─ manifest.webmanifest
├─ .env.local.example
├─ .env.local                    # ⛔ gitignored
├─ CLAUDE.md
├─ README.md
├─ next.config.ts
├─ tsconfig.json
└─ package.json
```

## 4. Модель данных

### 4.1 Таблицы

```sql
-- категории пользователя
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null,            -- hex like #3B82F6
  created_at  timestamptz not null default now(),
  constraint  categories_name_per_user unique (user_id, name),
  constraint  categories_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index categories_user_idx on public.categories (user_id);

-- траты
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete restrict,
  amount_minor  integer not null check (amount_minor > 0),  -- копейки
  currency      text   not null default 'RUB' check (length(currency) = 3),
  note          text   check (note is null or length(note) <= 200),
  spent_at      date   not null default (now() at time zone 'utc')::date,
  created_at    timestamptz not null default now()
);

create index expenses_user_spent_idx on public.expenses (user_id, spent_at desc);
create index expenses_category_idx   on public.expenses (category_id);
```

**Решения:**

- **UUID** вместо bigserial — Supabase так удобнее (нет последовательных ID,
  меньше утечки информации).
- **`amount_minor INTEGER`** в копейках. Никакого `numeric`/`float`. Max value
  ~21 млрд копеек = 21 млн ₽ за одну запись — для личных трат хватит.
- **`currency`** оставлен, но захардкожен в `'RUB'` на уровне UI. На будущее.
- **`spent_at DATE`** (без времени) — нам важен только день. UTC-дата при
  insert — фронт явно передаёт дату с учётом часового пояса пользователя
  (а не дефолт), чтобы «трата сегодня» в Москве совпадала с MSK.
- **`on delete restrict`** для категории: пока в категории есть траты, удалить
  её нельзя.

### 4.2 RLS

```sql
alter table public.categories enable row level security;
alter table public.expenses   enable row level security;

create policy "categories: own rows"
  on public.categories
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "expenses: own rows"
  on public.expenses
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Никаких других политик не нужно. JWT в запросе → `auth.uid()` известен → клиент
видит и пишет только свои строки.

### 4.3 Триггеры — нет

Намеренно не используем триггеры/функции в БД для MVP — agрегатами занимается
клиент (сумм за неделю по 50 строк хватит). Если данные вырастут, поверх
поставим view или server action.

## 5. Аутентификация

### 5.1 Поток

1. `/login` — форма с одним полем email и кнопкой «Получить ссылку».
2. `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '/auth/callback' }})`.
3. Письмо с ссылкой → клик → редирект на `/auth/callback?code=...`.
4. `/auth/callback/route.ts` обменивает код на сессию через
   `exchangeCodeForSession` → ставит httpOnly cookie → редирект на `/`.

### 5.2 Допуск / запрет регистрации

Поскольку приложение для одного пользователя, в Supabase Dashboard:

- **Auth → Providers → Email** оставляем включённым;
- **Auth → Settings → "Disable new sign-ups"** — включаем после первой
  собственной регистрации, чтобы никто посторонний не создал аккаунт через
  публичный URL.

Альтернатива: оставить регистрацию открытой, но добавить allowlist в RLS-policy
(`auth.email() = 'myemail@…'`). Для MVP — проще dashboard-флаг.

### 5.3 Серверная и клиентская части

- `lib/supabase/client.ts` — `createBrowserClient` для Client Components.
- `lib/supabase/server.ts` — `createServerClient` для Server Components и Server
  Actions (использует cookies из `next/headers`).
- Middleware (`src/middleware.ts`) — обновляет токен и перекидывает анонимов на
  `/login` со всех путей кроме `/login`, `/auth/*`.

## 6. Слой данных на фронте

### 6.1 React Query keys

```ts
const KEYS = {
  categories: ['categories'] as const,
  expenses:   (range: DateRange) => ['expenses', range] as const,
  summary:    (range: DateRange) => ['summary', range] as const,
};
```

### 6.2 Чтение

- `useCategories()` → `select * from categories order by name`.
- `useExpenses({ from, to })` → `select *, category:categories(*) from expenses
  where spent_at between ... order by spent_at desc, created_at desc`.
- `useSummary({ from, to })` — derived из `useExpenses` через `select` (TanStack
  Query `select` опция): total + breakdown по категориям. Никаких отдельных
  запросов.

### 6.3 Запись (мутации)

- `createExpense`, `updateExpense`, `deleteExpense` → `insert/update/delete` в
  Supabase, `onSuccess` → `queryClient.invalidateQueries({ queryKey: ['expenses']
  })` и `['summary']`.
- Категории — то же самое с `['categories']`.
- Используем **optimistic updates** для удаления и редактирования трат (трата
  пропадает/меняется мгновенно, откатывается при ошибке). Для создания —
  обычный flow с лоадером кнопки.

## 7. Валидация (zod)

```ts
export const createExpenseSchema = z.object({
  amount_rub:  z.number().positive().max(20_000_000),
  category_id: z.string().uuid(),
  note:        z.string().max(200).optional().nullable(),
  spent_at:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createCategorySchema = z.object({
  name:  z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
```

Те же схемы — для RHF на форме и для финального трансформа перед insert
(`amount_rub → amount_minor = Math.round(amount_rub * 100)`).

## 8. Дизайн-система

Источник правды — `design-system/moneta/MASTER.md`. Перед написанием новой
страницы / компонента — сверяемся:

- Токены цветов / шрифтов / spacing / radius / shadow — там.
- Page-specific отклонения кладём в `design-system/moneta/pages/<page>.md` и
  они переопределяют MASTER для конкретной страницы.

Tailwind v4 `@theme` блок в `globals.css` экспортирует те же значения, что в
MASTER, чтобы не было двух источников правды.

## 9. PWA

- `public/manifest.webmanifest` с `name`, `short_name="moneta"`, `display:
  standalone`, иконками 192/512.
- Service Worker через `@ducanh2912/next-pwa` — генерим в build-step,
  стандартный runtime caching (CacheFirst для статики, NetworkFirst для
  `/_next/data/`).
- Meta-теги `theme-color`, `apple-mobile-web-app-capable` в `<head>`.

## 10. Локальная разработка

```bash
# первая настройка
cp .env.local.example .env.local         # вписать ключи Supabase
npm install
npm run dev                              # http://localhost:3000
```

**Supabase локальный (опционально):**

Для real ускорения dev-цикла без интернета:

```bash
npx supabase start                       # поднимает Postgres + Auth + Studio
npx supabase db push                     # применить миграции
```

В `.env.local` — локальные URL/ключи (печатает `supabase start`).

Для MVP можно начать сразу на cloud-проекте Supabase, локалка опциональна.

## 11. Деплой

### Frontend

- **Vercel** (бесплатный hobby tier).
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Auto-deploy на push в `main`.

### БД / Auth

- **Supabase Cloud** — free tier.
- Миграции применяем через `supabase db push` из локали (или CI).
- В Supabase Dashboard включаем «Disable new sign-ups» после первой
  регистрации.

## 12. Что вне MVP в техническом смысле

- Нет тестов (unit/integration) на старте — добавим после первой сборки фичей,
  чтобы не оверинженирить пустоту.
- Нет CI кроме deploy preview от Vercel.
- Нет Sentry / error reporting. Заведём, когда начнём ловить продакшен-баги.
- Нет фича-флагов, A/B, аналитики.

## 13. Definition of Done — техническая часть

- [ ] `npm run build` без ошибок и warning-ов от TS.
- [ ] `npm run lint` чистый.
- [ ] Миграция `supabase/migrations/20260517_init.sql` применяется на чистую БД
      и проходит smoke-проверку (создать категорию + трату из UI работает).
- [ ] Все запросы к Supabase идут только с авторизованным JWT (middleware
      редиректит анонимов).
- [ ] `.env.local.example` содержит все нужные ключи (без значений).
- [ ] README объясняет: как развернуть Supabase, где взять ключи, как
      запустить локально.
- [ ] PWA-манифест на месте, lighthouse-PWA-score ≥ 90.
