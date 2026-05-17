# moneta

Личный трекер расходов: одна форма, чтобы за 5 секунд записать трату с
телефона; одна сводка, чтобы видеть, на что уходят деньги.

> **Статус:** MVP в разработке. Next.js PWA + self-hosted Supabase (Postgres +
> GoTrue Auth) — оба сервиса в Coolify на собственной VPS. Бэкенда «своего»
> нет, фронт ходит в Supabase напрямую, безопасность через Row-Level Security.

## Документация

- 📘 [`docs/business-spec.md`](./docs/business-spec.md) — что мы делаем и
  зачем (и чего НЕ делаем в MVP).
- 🛠 [`docs/tech-spec.md`](./docs/tech-spec.md) — стек, архитектура,
  модель данных, auth, деплой.
- 🎨 [`design-system/moneta/MASTER.md`](./design-system/moneta/MASTER.md) —
  токены и UI-правила.

## Стек

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase self-hosted
(Postgres + GoTrue Auth) · react-query · react-hook-form + zod · lucide-react ·
sonner. **Хостинг:** собственная VPS под Coolify (Supabase и Next.js — два
сервиса).

## Быстрый старт (локально)

```bash
# 1. Зависимости
npm install

# 2. Окружение
cp .env.local.example .env.local
# Вариант A: указать NEXT_PUBLIC_SUPABASE_URL/KEY от Supabase в Coolify на VPS
# Вариант B: поднять локальный Supabase (Docker) и взять локальные URL/KEY:
#   npx supabase start
#   npx supabase db push          # применит миграции из supabase/migrations/

# 3. Dev-сервер
npm run dev
# → http://localhost:3000
```

## Первый аккаунт

Публичной регистрации нет. После деплоя Supabase зайти в Studio
(`https://supabase.your-domain.com`) → **Authentication → Users → Add user**,
поставить «Auto Confirm User» и сохранить. Дальше — этот email/password на
`/login` приложения. Подробнее в [`docs/tech-spec.md §5`](./docs/tech-spec.md).

## Деплой

Оба сервиса в Coolify на одной VPS:

1. **Supabase** — Coolify → New Resource → Service → Supabase (one-click).
   Получить anon key из env сервиса.
2. **moneta** (Next.js) — Coolify → New Resource → Application → подключить
   репо, выставить `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Полный gайд — в [`docs/tech-spec.md §11`](./docs/tech-spec.md).

## Команды

| Команда           | Что делает                          |
| ----------------- | ----------------------------------- |
| `npm run dev`     | Dev-сервер (Turbopack)              |
| `npm run build`   | Production-сборка                   |
| `npm run start`   | Запуск production-сборки локально   |
| `npm run lint`    | ESLint                              |

## Структура

```
src/
  app/            # Next.js App Router (страницы + layouts)
  components/     # UI-примитивы и составные блоки
  lib/            # supabase client, money, dates, zod-схемы
  hooks/          # React Query хуки
supabase/
  migrations/     # SQL миграции
design-system/    # UI source of truth (MASTER.md + page overrides)
docs/             # business + tech specs
```

## Лицензия

Личный проект, без открытой лицензии. Если откроем — обновим этот блок.
