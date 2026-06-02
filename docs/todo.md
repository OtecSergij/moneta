# Статус и заметки

MVP почти готов: авторизация (Better Auth + email/password + Google OAuth +
Resend), продуктовые страницы (главная / история / настройки), PWA, тест-инфра
на Testcontainers. Критерии готовности — `docs/business-spec.md` §8.

Осталось: **деплой на VPS под Coolify** — Postgres как managed-ресурс + Next.js
(Dockerfile / Nixpacks), HTTPS на субдоменах, ежедневный `pg_dump`; при деплое —
prod-redirect-URI в Google OAuth и Publish app на consent screen.

Ниже — место для лёгких заметок «не задача, но не забыть».
