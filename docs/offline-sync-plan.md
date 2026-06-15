# План: offline-first синхронизация для moneta

Статус: черновик плана (код ещё не пишем). Реализация — по фазам, см. §11.

Вводные: **полный offline-first + мульти-девайс** (delta-pull, last-write-wins).

## Цели / не-цели

**Цели:** PWA открывается и полностью работает оффлайн (чтение + создание/правка/
удаление трат и категорий); изменения копятся локально и синхронизируются при
появлении сети; один аккаунт на нескольких устройствах сходится через delta-pull
+ last-write-wins.

**Не-цели:** real-time/коллаборация, CRDT, оффлайн-смена пароля/логин, оффлайн
email-верификация. Backlog бизнес-спеки не трогаем.

## Главный сдвиг архитектуры

Источник правды **для UI** переезжает в браузер (IndexedDB). Сервер становится
merge-точкой синхронизации. RSC остаётся для первой отрисовки (seed), но
интерактив читает из локального стора. `router.refresh()` как механизм обновления
уходит.

```
UI (client components)
   ├─ read  ← Dexie (useLiveQuery)         ← мгновенно, оффлайн
   └─ write → Dexie + outbox               ← оптимистично
                  │
            Sync engine  ──push──►  POST /api/sync/push   ─┐
                  ▲      ◄─pull──   GET  /api/sync/pull    ─┤→ repos → Postgres
                  └── triggers: online / focus / after-mutation / SW background-sync
Service Worker (serwist): app-shell + static cache, /api → NetworkOnly
```

## 1. Модель данных (миграция Drizzle)

К `expenses` и `categories` добавить:

- `updatedAt timestamptz NOT NULL DEFAULT now()` — ставится сервером на **каждой**
  записи. Используется и как ключ LWW, и как курсор pull.
- `deletedAt timestamptz NULL` — tombstone (мягкое удаление, чтобы удаление
  доезжало на другие устройства).

Backfill: `updatedAt = createdAt` для существующих строк. Индекс под pull-курсор:
`(user_id, updated_at, id)`.

`id` остаётся `uuid`, но **генерируется на клиенте** (`crypto.randomUUID()`) —
сервер принимает его в upsert.

**Курсор и LWW:** курсор pull = кортеж `(updatedAt, id)`, упорядочивание
`ORDER BY updated_at, id`. LWW — «выигрывает последняя по `updatedAt`». Берём
**серверное `updatedAt = now()`** на момент применения (sync-time LWW): не зависит
от кривых клиентских часов, курсор монотонный. Компромисс: трата, отредактированная
оффлайн давно и запушенная позже, перезапишет более свежую правку с другого
устройства. Для личного трекера приемлемо; при желании позже добавим клиентский
`editedAt` для edit-time LWW.

## 2. Сервер: sync API + репозитории

**Новые route handlers** (REST нужен, т.к. Background Sync из SW умеет только
`fetch`, а не server actions):

- `POST /api/sync/push` — тело `{ ops: Op[] }`, где
  `Op = { opId, entity: 'expense'|'category', type: 'upsert'|'delete', id, payload }`.
  На каждую op: `requireSession` → zod-валидация → проверка владения
  (`userOwnsCategory`) → в транзакции
  `INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE user_id = $user` с
  `updated_at = now()`; для delete — `SET deleted_at = now(), updated_at = now()`.
  Возвращает per-op `{opId, ok, id, updatedAt}`. **Идемпотентность естественная**
  (upsert/soft-delete по id), отдельный лог op не нужен. Категории в батче
  обрабатываются раньше трат (FK).
- `GET /api/sync/pull?since=<updatedAt>&sinceId=<id>&limit=500` —
  `WHERE user_id = $user AND (updated_at, id) > ($since, $sinceId)
  ORDER BY updated_at, id LIMIT n`, отдаёт строки **включая tombstones** +
  `nextCursor` + `hasMore`.

**Репозитории (`src/repositories/expenses.ts`, `categories.ts`):**

- `createExpense` → upsert по `(userId, id)`, принимает клиентский id.
- `updateExpense`/`createExpense` → проставляют `updatedAt`.
- `deleteExpense`/`deleteCategory` → soft delete (`deletedAt = now()`).
- Все чтения (`listExpenses`, `summary`, `listCategories`, `getExpense`…) →
  фильтр `deleted_at IS NULL`.
- Изоляция по `userId` сохраняется как есть.

Существующие server actions (`src/lib/actions/expenses.ts`) можно оставить для
прогрессивного улучшения (онлайн first-load), но основной путь записи — через
клиентский outbox → `/api/sync/push`.

## 3. Клиентский локальный стор (Dexie)

БД с именем `moneta-${userId}` (полная изоляция между аккаунтами; чистится при
логауте). Stores:

- `expenses` — pk `id`, поля траты + `updatedAt`, `deletedAt`, `syncState`.
- `categories` — аналогично.
- `outbox` — pk `opId`, `{entity, type, id, payload, createdAt, attempts, lastError}`.
- `meta` — `pullCursor {updatedAt,id}`, `lastSyncAt`.

Реактивность — `dexie-react-hooks` `useLiveQuery`. **`summary` сейчас считается
SQL-агрегатом** — для оффлайна переписываем агрегацию по категориям на TS поверх
Dexie (общие константы выносим, чтобы не разъехалось с сервером).

## 4. Путь чтения (refactor RSC → Dexie)

Гибрид: RSC-страницы (`src/app/page.tsx`, `history`) рендерят шелл и отдают
начальный снапшот; `<SyncProvider>` (client) сидирует им Dexie на первом
онлайн-заходе, дальше списки/сводка читают из Dexie через хуки
(`useExpenses`, `useCategories`, `useSummary`). На оффлайн/повторных заходах SW
отдаёт кэш-шелл, клиент рендерит из Dexie. Затрагивает: `page.tsx`, recents,
history, summary-компоненты.

## 5. Путь записи (outbox)

Модуль `mutations`:

- `addExpense(input)` → `id = crypto.randomUUID()`, запись в Dexie +
  `outbox(upsert)`, триггер sync.
- `updateExpense(id, patch)` → патч Dexie + `outbox(upsert полной строки)`.
- `deleteExpense(id)` → `deletedAt` в Dexie (исчезает из вьюх) +
  `outbox(delete)`.

Оптимистичность — by design (UI читает Dexie). Перехват — `onSubmit/onDelete` в
`quick-add-form.tsx`, `edit-expense-dialog.tsx`, формах категорий.
zod-валидация переиспользуется на клиенте до постановки в очередь.

## 6. Sync-движок

Синглтон на клиенте:

- `flush()` — слить outbox по порядку (категории раньше трат) →
  `/api/sync/push`; на ok удалить из outbox, обновить `syncState`/`updatedAt`.
- `pull()` — цикл `/api/sync/pull` до `!hasMore`, применить merge-правило,
  сдвинуть курсор.
- `runSync()` = онлайн? `flush()` затем `pull()`.
- **Merge-правило на pull:** если по id есть запись в outbox → пропустить
  (локальное выигрывает до пуша); иначе применить если
  `incoming.updatedAt >= local.updatedAt`; tombstone убирает из активных вьюх.
- Триггеры: `online`, `visibilitychange`/focus, после мутации (debounce),
  событие `sync` из SW (через postMessage будит `flush`). Бэкофф + счётчик
  `attempts`, индикатор статуса (sonner / бейдж).

## 7. Service Worker (serwist)

`@serwist/next` + `serwist`: `app/sw.ts`, `withSerwist` в `next.config.ts`,
регистрация в client-компоненте.

- Precache build-ассетов (инжектит serwist).
- Runtime: static/`_next/static`/иконки — CacheFirst; навигация — fallback на
  закэшированный app-shell; `/api/sync/*` и `/api/auth/*` — **NetworkOnly**.
- Background Sync: SW по событию `sync` будит приложение (postMessage) →
  `flush()`. **Очередь одна — app-level outbox** (без дублирующей SW-очереди).
- `navigator.storage.persist()` против вытеснения IndexedDB; промпт «доступно
  обновление».

> Нюанс: SW в dev с Turbopack капризен — включаем/тестируем в основном на
> prod-build (`npm run build && start`).

## 8. Auth и мульти-юзер

- Sync-эндпоинты за `requireSession` (через `src/lib/dal.ts`).
- `userId` кэшируем после логина; на логауте — `signOut` + удаление Dexie-БД +
  снятие регистрации sync.
- 401 от push/pull → стоп sync, outbox сохраняется, тост + редирект на `/login`
  при онлайне. Сессия 30 дней rolling — на реконнекте в пределах 30 дней валидна.

## 9. Краевые случаи

- Категория и трата созданы оффлайн вместе → outbox шлёт категории раньше трат (FK).
- Удаление непустой категории: сейчас сервер запрещает. Оффлайн валидируем по
  локальным данным; сервер — авторитет, при reject откатываем tombstone + тост.
- Конфликт «правка vs удаление» → LWW по `updatedAt` (tombstone с более поздним
  временем побеждает).
- Вытеснение IndexedDB → persistent storage; большой первый снапшот → пагинация
  pull.

## 10. Тестирование

- **Unit (без БД):** merge-правило (LWW / tombstone / dirty-skip), редьюсер
  outbox, клиентская агрегация summary, сдвиг курсора.
- **Integration (testcontainers):** push-идемпотентность, pull пагинация/курсор,
  изоляция по userId, фильтр soft-delete. Обновить существующие
  `expenses.itest.ts`/`categories.itest.ts` под `deletedAt`.
- **Ручной E2E:** оффлайн-создание → онлайн-синк; слияние двух «устройств»
  (две Dexie-БД / две сессии).

## 11. Разбивка на фазы (под субагентов)

- **A. Схема + серверный фундамент** — миграция (`updatedAt`/`deletedAt` +
  backfill + индекс), правки репозиториев (upsert-by-id, soft-delete, фильтры),
  `/api/sync/push|pull`, integration-тесты. *(блокирует остальные — делаем первой)*
- **B. Локальный стор + чтение** — Dexie-схема, `SyncProvider` + seed, хуки
  `useExpenses/useCategories/useSummary`, перевод home/history/summary на Dexie,
  клиентская агрегация + тесты.
- **C. Запись + sync-движок** — `mutations`, перенос форм на outbox, движок
  (flush/pull/runSync, триггеры, бэкофф, статус), тесты merge/outbox.
- **D. Service Worker / PWA** — serwist, `sw.ts`, `withSerwist`, регистрация,
  runtime-кэш + navigation fallback, background-sync wake, persistent storage,
  update-prompt.
- **E. Харднинг** — мульти-девайс merge-тесты, FK-порядок, откат reject
  категории, 401-флоу, вытеснение, пагинация большого снапшота.

Зависимости: **A → B → C → D**, E сквозная. A строго первой (фиксирует контракт
и схему). B и подготовку D можно вести параллельно после A.

## 12. Открытые вопросы / риски

- LWW: sync-time (рекоменд., в плане) vs edit-time с клиентским `editedAt` —
  пересмотрим при необходимости.
- Дублирование логики `summary` клиент/сервер — выносим общие константы.
- Гибрид RSC+Dexie vs полностью клиентское чтение — в плане гибрид; можно
  упростить до full-client.
- serwist + Turbopack в dev — тестируем на prod-build.
