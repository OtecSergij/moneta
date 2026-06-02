# Задачи разработки

Каждый файл в этой папке — **self-contained brief** для отдельной агентской
сессии. Агенту даётся ровно один такой файл; он должен содержать достаточно
контекста, чтобы качественно сделать задачу без чтения переписки.

## Общий путь движения

Сделано: фундамент авторизации (Better Auth + Drizzle + Postgres), data-слой
(схемы `categories`/`expenses`, repository pattern, isolation-тесты), весь
**Auth UI** (логин/регистрация/восстановление, `proxy.ts`, `src/lib/dal.ts`) и
**продуктовые страницы** — главная (`/`), история (`/history`), настройки
(`/settings`) по `docs/business-spec.md` §5. **Google OAuth** (credentials в
Google Cloud Console) и **Resend** (домен + DNS: SPF/DKIM/DMARC) настроены —
письма верификации и сброса пароля уходят боевые.

Осталось:

1. **PWA** — манифест, иконки, установка на главный экран.
2. **Деплой** — Coolify на VPS (Next.js + Postgres за HTTPS на субдоменах),
   ежедневный `pg_dump`. При деплое добавить prod-redirect-URI в Google OAuth
   client и **Publish app** на consent screen.

Параллельно (можно в любой момент):
- **Testcontainers + `.itest.ts` split** — починить test infrastructure
  чтобы `npm run test:run` не требовал руками поднимать Postgres.

## Готовые брифы

- [`auth-ui.md`](./auth-ui.md) — пять auth-страниц + cleanup Vercel-бойлерплейta
  + `proxy.ts` + `src/lib/dal.ts`. Сделано.
- [`testcontainers-and-itest-split.md`](./testcontainers-and-itest-split.md)
  — Testcontainers для тестов + разделение unit/integration по расширению.
