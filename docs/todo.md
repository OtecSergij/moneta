# TODO — отложенные задачи

Сюда складываем штуки, которые осознанно отложили — чтобы не забыть.

---

## Testcontainers + `.itest.ts` сплит для интеграционных тестов

**Сейчас:** интеграционные тесты репозиториев бегут против отдельной БД
`moneta_test` на том же docker-compose Postgres. Setup в `src/test/global-setup.ts`
накатывает миграции один раз. Все тесты лежат в `*.test.ts` (unit и
интеграционные не разделены), требуют запущенный Postgres для прогона.

**Чего хочется:**

1. **Testcontainers** — поднимать свежий Postgres-контейнер на каждый test run
   (надёжная изоляция от dev-данных, БД точно та же версия что и в проде, не
   зависим от глобального docker-compose).
2. **Расширение `*.itest.ts`** для интеграционных тестов отдельно от unit:
   - `*.test.ts` — unit, бегут везде, без БД
   - `*.itest.ts` — интеграционные, требуют БД (или Testcontainers)
3. **CI/локальный сплит:**
   - `npm run test:unit` — быстро, без БД (часть pre-commit hook)
   - `npm run test:integration` — отдельным шагом, поднимает контейнер
   - `npm run test:run` — оба последовательно (для CI)
4. **Vitest projects/workspaces** для разделения конфигов unit ↔ integration.

**Когда делать:** когда юнит-тестов набьётся ощутимо больше интеграционных,
или когда захочется fully isolated test runs (например, в GitHub Actions без
заранее поднятого Postgres).

**Деп. для будущего:** `@testcontainers/postgresql`.

**Сайд-эффект на pre-commit:** сейчас `npm run test:run` в pre-commit чеклисте
(`CLAUDE.md`) требует Postgres up — если БД лежит, prequel зеленый только когда
запущен `docker compose up -d postgres`. Эта задача чинит и это.
