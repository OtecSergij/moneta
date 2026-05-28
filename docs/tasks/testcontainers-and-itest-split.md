# Testcontainers + `.itest.ts` split для интеграционных тестов

## Goal

Сейчас интеграционные тесты репозиториев требуют **руками запущенный
Postgres** (`docker compose up -d postgres`) — `npm run test:run` падает
если БД лежит. Это ломает pre-commit checklist (см. CLAUDE.md «Перед
коммитом»). Цель — сделать тесты самодостаточными (поднимают свой
Postgres-контейнер) и разделить unit (быстро, без БД) и integration
(медленно, с БД) по расширению файлов.

## Контекст: что сейчас

- **Vitest 3.x** установлен и работает (`vitest.config.ts`).
- **Setup:** [`src/test/global-setup.ts`](../../src/test/global-setup.ts)
  создаёт БД `moneta_test` на **уже запущенном** `docker-compose` Postgres
  + накатывает миграции. Подключение жёстко зашито в URL
  `postgresql://postgres:postgres@localhost:5432/...`.
- **Factories:** [`src/test/factories.ts`](../../src/test/factories.ts) —
  `mkUser`, `mkCategory`. Вставляют напрямую через Drizzle, не через репо.
- **Тесты:** все в формате `*.test.ts`, лежат рядом с кодом
  (`src/repositories/categories.test.ts`, `src/repositories/expenses.test.ts`).
  9 тестов, ~700ms. Сейчас они все «интеграционные» — бьют в реальную БД.
- **vitest.config:** `pool: 'forks'`, `singleFork: true`, env с
  `DATABASE_URL` указывающим на `moneta_test`.
- **package.json scripts:** `test`, `test:run`.

## Deliverables

### 1. Testcontainers для интеграционных тестов

- Установить `@testcontainers/postgresql` как devDep.
- Переписать `src/test/global-setup.ts`:
  - Поднимать свежий `postgres:17` через Testcontainers (тот же образ что
    в `docker-compose.yml`).
  - Дождаться `pg_isready`.
  - Записать реальный `DATABASE_URL` контейнера в process.env (или через
    vitest `provide`/`inject` mechanism — см. docs vitest на predicate
    `globalSetup`).
  - Накатить миграции на свежую БД.
  - В teardown — остановить контейнер.
- Убрать жёстко зашитый URL из `vitest.config.ts` (его теперь предоставит
  globalSetup).
- Убрать зависимость от `docker compose up -d postgres` для тестов —
  локальный `docker-compose.yml` остаётся для dev-DB, тесты теперь
  независимы.

**Trade-off:** старт контейнера добавляет ~3-5 сек к первому test run
(потом контейнер живёт и переиспользуется внутри одной vitest-сессии).
Сейчас тесты стартуют мгновенно потому что Postgres уже поднят.
Допустимая цена за самодостаточность.

### 2. Сплит unit / integration по расширению

- Все текущие тесты переименовать: `*.test.ts` → `*.itest.ts` (они все
  интеграционные).
- Создать два vitest project (vitest 3.x supports projects):
  - **`unit`:** include `**/*.test.ts`, exclude `**/*.itest.ts`. Без
    globalSetup (контейнер не нужен), быстро.
  - **`integration`:** include `**/*.itest.ts`. С globalSetup из Testcontainers.
- Обновить `vitest.config.ts` либо разделить на два config-файла
  (`vitest.config.unit.ts` + `vitest.config.integration.ts`), в зависимости
  от удобства.

### 3. Новые npm scripts

```jsonc
"test": "vitest",                          // watch, все
"test:run": "vitest run",                  // one-shot, все
"test:unit": "vitest run --project unit",  // быстро, без БД
"test:integration": "vitest run --project integration"  // с Testcontainers
```

Точные флаги — по актуальному vitest API (см.
`node_modules/vitest/dist/`).

### 4. Обновить CLAUDE.md «Перед коммитом»

Сейчас:
```
3. `npm run test:run` — тесты зелёные. Требует запущенный Postgres
   (`npm run db:up`) — интеграционные тесты репозиториев бегут против
   `moneta_test` БД. Это починят Testcontainers (см. `docs/todo.md`).
```

Должно стать:
```
3. `npm run test:unit` — unit-тесты зелёные. Быстрые, без БД.
4. `npm run test:integration` — интеграционные зелёные (поднимают Postgres
   через Testcontainers, занимает ~5 сек). Если торопишься — можно отложить
   до push'а, CI всё равно прогонит.
```

(Альтернатива: оставить `npm run test:run` как «и то и другое»
обязательным шагом — на твоё усмотрение, оптимизируй под dev-workflow.)

### 5. Удалить docs/todo.md или почистить

Сейчас [`docs/todo.md`](../todo.md) ссылается на эту задачу как «отложенный
TODO». После выполнения — либо удали файл целиком, либо очисти секцию про
Testcontainers (оставив пустой каркас под будущие заметки).

## Соглашения

- Тесты остаются рядом с кодом (co-located), не выносить в отдельную
  папку `tests/`.
- Factories ([`src/test/factories.ts`](../../src/test/factories.ts))
  остаются — они полезны и для будущих тестов. Не трогать.
- Singleton DB client в [`src/db/index.ts`](../../src/db/index.ts) — не
  трогать, он смотрит на `process.env.DATABASE_URL` который теперь
  предоставляет Testcontainers globalSetup.

## Acceptance

- `npm run test:unit` ✅ (0 тестов сейчас, должен пройти за <1 сек,
  exit 0 благодаря `passWithNoTests`).
- `npm run test:integration` ✅ — поднимает контейнер, прогоняет 9
  существующих isolation-тестов.
- `npm run test:run` ✅ — оба проекта последовательно.
- Без `npm run db:up` запущенного — `npm run test:integration` всё равно
  работает (контейнер поднимается изнутри).
- Соответствующий `docker compose down` НЕ ломает тесты (Testcontainers
  не зависит от наших volumes).
- `npm run build` / `lint` зелёные.
- CLAUDE.md обновлён.

## Out of scope

- Не добавляй новых тестов — твоя задача про инфраструктуру.
- Не меняй логику самих тестов (`categories.test.ts`, `expenses.test.ts`)
  кроме переименования файлов.
- Не трогай repository код или схемы.
- CI-конфиг (GitHub Actions etc.) — не настраиваем, его пока нет.

## Open questions

- **Один контейнер на всю test-сессию vs контейнер на каждый файл?**
  Testcontainers поддерживает оба. Один-на-сессию — быстрее (старт раз),
  но если тесты пишут конфликтующие данные между файлами — могут падать.
  Сейчас тесты пишут уникальных юзеров каждый раз (uuid email), так что
  один контейнер должен сработать. Спроси пользователя если есть сомнения
  или начни с одного и эскалируй если флак.
- **Тестовая БД название** — оставляем `moneta_test`? Testcontainers
  позволяет задать любое имя. Принципиальной разницы нет.
