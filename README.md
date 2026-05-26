# moneta

Личный трекер расходов: одна форма, чтобы за 5 секунд записать трату с
телефона; одна сводка, чтобы видеть, на что уходят деньги.

> **Статус:** MVP в разработке. Next.js PWA + self-hosted (Postgres +
> GoTrue Auth) — оба сервиса в Coolify на собственной VPS. DB postgres, безопасность через Row-Level Security.

## Документация

- 📘 [`docs/business-spec.md`](./docs/business-spec.md) — что мы делаем и
  зачем (и чего НЕ делаем в MVP).
- 🎨 [`design-system/moneta/MASTER.md`](./design-system/moneta/MASTER.md) —
  токены и UI-правила.

## Стек

Next.js 16 (App Router) · TypeScript · Tailwind last ·
(Postgres + GoTrue Auth) · react-query · react-hook-form + zod · lucide-react ·
sonner. **Хостинг:** собственная VPS под Coolify

## Команды

| Команда           | Что делает                          |
| ----------------- | ----------------------------------- |
| `npm run dev`     | Dev-сервер (Turbopack)              |
| `npm run build`   | Production-сборка                   |
| `npm run start`   | Запуск production-сборки локально   |
| `npm run lint`    | ESLint                              |

## Лицензия

Личный проект, без открытой лицензии. Если откроем — обновим этот блок.
