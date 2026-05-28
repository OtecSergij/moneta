# Задачи разработки

Каждый файл в этой папке — **self-contained brief** для отдельной агентской
сессии. Агенту даётся ровно один такой файл; он должен содержать достаточно
контекста, чтобы качественно сделать задачу без чтения переписки.

## Общий путь движения

Сейчас сделано: фундамент авторизации (Better Auth + Drizzle + Postgres) и
data-слой (схемы `categories`/`expenses`, repository pattern, isolation-тесты).
Auth работает на API-уровне, данные изолированы, тесты зелёные.

Дальше движение:

1. **Auth UI** — пять страниц регистрации/логина/восстановления, чтобы
   юзер мог реально пользоваться системой через браузер. Сюда же —
   `proxy.ts` для защиты роутов, `src/lib/dal.ts` для `getSession` в RSC,
   и чистка Vercel-бойлерплейта.
2. **Первые продуктовые страницы** — главная (`/`), история (`/history`),
   настройки (`/settings`) по `docs/business-spec.md` §5. Скоуп обсудим
   когда дойдём.
3. **PWA + деплой** — манифест, иконки, Coolify, Resend DNS, Google Cloud
   Console. Тоже когда дойдём.

Параллельно (можно в любой момент):
- **Testcontainers + `.itest.ts` split** — починить test infrastructure
  чтобы `npm run test:run` не требовал руками поднимать Postgres.

## Готовые брифы

- [`auth-ui.md`](./auth-ui.md) — пять auth-страниц + cleanup Vercel-бойлерплейта
  + `proxy.ts` + `src/lib/dal.ts`.
- [`testcontainers-and-itest-split.md`](./testcontainers-and-itest-split.md)
  — Testcontainers для тестов + разделение unit/integration по расширению.
