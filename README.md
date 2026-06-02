# moneta

Личный трекер расходов: одна форма, чтобы за 5 секунд записать трату с
телефона; одна сводка, чтобы видеть, на что уходят деньги.

> **Статус:** MVP в разработке. Next.js PWA + Postgres + Better Auth —
> оба сервиса в Coolify на собственной VPS. Multi-user с изоляцией данных
> через repository pattern.

## Документация

- 📘 [`docs/business-spec.md`](./docs/business-spec.md) — что мы делаем и
  зачем (и чего НЕ делаем в MVP).
- 🔐 [`docs/auth-decisions.md`](./docs/auth-decisions.md) — Better Auth,
  сессии, OAuth, email verification, rate limiting.
- 🎨 [`design-system/moneta/MASTER.md`](./design-system/moneta/MASTER.md) —
  токены и UI-правила.

## Стек

Next.js 16 (App Router) · TypeScript · Tailwind last · Postgres ·
Drizzle ORM · Better Auth · Resend · @tanstack/react-query ·
react-hook-form + zod · lucide-react · sonner · date-fns.
**Хостинг:** собственная VPS под Coolify.

## Команды

| Команда             | Что делает                          |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Dev-сервер (Turbopack)              |
| `npm run build`     | Production-сборка                   |
| `npm run start`     | Запуск production-сборки локально   |
| `npm run lint`      | ESLint                              |
| `npm test`          | Vitest watch (оба проекта)          |
| `npm run test:run`  | Все тесты one-shot (для CI)         |
| `npm run test:unit` | Unit — быстро, без БД               |
| `npm run test:integration` | Integration — Postgres через Testcontainers |

## Лицензия

Личный проект, без открытой лицензии. Если откроем — обновим этот блок.
