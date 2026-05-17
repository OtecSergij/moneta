# moneta

Личный трекер расходов: одна форма, чтобы за 5 секунд записать трату с
телефона; одна сводка, чтобы видеть, на что уходят деньги.

> **Статус:** MVP в разработке. Бэкенда «своего» нет — Next.js PWA + Supabase
> (Postgres + Auth) с прямыми запросами из браузера, защищёнными через
> Row-Level Security.

## Документация

- 📘 [`docs/business-spec.md`](./docs/business-spec.md) — что мы делаем и
  зачем (и чего НЕ делаем в MVP).
- 🛠 [`docs/tech-spec.md`](./docs/tech-spec.md) — стек, архитектура,
  модель данных, auth, деплой.
- 🎨 [`design-system/moneta/MASTER.md`](./design-system/moneta/MASTER.md) —
  токены и UI-правила.

## Стек

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase
(Postgres + Auth) · react-query · react-hook-form + zod · lucide-react ·
sonner. Hosting: Vercel.

## Быстрый старт

```bash
# 1. Зависимости
npm install

# 2. Окружение
cp .env.local.example .env.local
# Заполнить NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY
# (из Supabase Dashboard → Project Settings → API)

# 3. Применить миграции на Supabase
#    Вариант А — на cloud-проекте Supabase:
npx supabase link --project-ref <your-ref>
npx supabase db push

#    Вариант Б — на локальном Supabase (Docker):
npx supabase start
npx supabase db push

# 4. Dev-сервер
npm run dev
# → http://localhost:3000
```

После первой собственной регистрации стоит выключить дальнейший приём заявок:
**Supabase Dashboard → Authentication → Settings → "Disable new sign-ups"**.

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
