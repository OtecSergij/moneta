# План: offline-first синхронизация для moneta

Статус: черновик плана (код ещё не пишем). Реализация — по фазам, см. §11.

Вводные: **полный offline-first + мульти-девайс** (delta-pull, last-write-wins).

> Этот файл включает результаты валидации против реального кода (схема,
> репозитории, server actions, формы, DAL, auth, summary). Спорные/недо­
> определённые места сведены в §0 «Контракт Фазы A».

## 0. Контракт Фазы A (зафиксировать ДО кода)

Эти решения фиксирует Фаза A — на них опираются B/C/D, поэтому их недопустимо
оставлять открытыми (иначе B/C/D придётся переделывать):

1. **Уникальность имени категории + soft-delete.** Текущий
   `categories_user_name_uniq (user_id, name)` (`schema/categories.ts:33`) с
   tombstone-строками ломается: удалил «Еда» → создаёшь «Еда» снова → `23505`,
   т.к. tombstone держит слот. Решение: заменить на **partial unique index
   `(user_id, name) WHERE deleted_at IS NULL`** + per-op обработка
   `isUniqueViolation` на push (хелпер `lib/db-errors.ts` уже есть) + клиентская
   реконсиляция (см. §9).
2. **Семантика soft-delete категории.** FK `categoryId → onDelete: "restrict"`
   (`schema/expenses.ts:40-42`) при soft-delete **не срабатывает** (строка не
   удаляется) — защита «непустую нельзя» полностью уезжает в app-логику, а
   подсчёт трат в `deleteCategory` (`categories.ts:82`) обязан стать
   **`deleted_at IS NULL`-aware**. Поведение трат-сирот (ссылаются на
   tombstone-категорию из-за кросс-девайс гонки) — см. §2/§9.
3. **Курсор pull — per-entity.** `expenses` и `categories` — две таблицы с
   независимым прогрессом; одним курсором их не покрыть. Pull параметризуется
   `?entity=expense|category`, в `meta` хранятся **раздельные курсоры**.
4. **Ключ курсора — монотонный `syncSeq`, не `updatedAt`.** В Postgres `now()` =
   время *начала транзакции*; перекрывающиеся push-транзакции могут закоммититься
   в обратном относительно `now()` порядке → pull, сдвинувший курсор, **молча
   пропустит** строку (тихая потеря, не конфликт). Поэтому ключ курсора — отдельная
   колонка `syncSeq bigint` из sequence (присваивается на каждой записи), а
   `updatedAt` остаётся **только** ключом LWW. Это две разные колонки.
5. **Границы транзакций push — per-op (или per-entity).** Один батч в одной
   транзакции = падение одной op (напр. дубль имени из п.1) откатит всё, и
   FK-порядок «категории раньше трат» не спасёт. Каждая op применяется в своей
   транзакции; клиент получает per-op результат.

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
                  └── triggers: online / focus / after-mutation / SW background-sync*
Service Worker (serwist): app-shell + static cache, /api → NetworkOnly
* background-sync недоступен в iOS/Safari — деградация на остальные триггеры (§7)
```

## 1. Модель данных (миграция Drizzle)

К `expenses` и `categories` добавить:

- `updatedAt timestamptz NOT NULL DEFAULT now()` — серверное время записи,
  **ключ LWW** (и больше ничего; для курсора не используется).
- `deletedAt timestamptz NULL` — tombstone (мягкое удаление, чтобы удаление
  доезжало на другие устройства).
- `syncSeq bigint NOT NULL` — **ключ курсора pull**, из sequence
  (`expenses_sync_seq` / `categories_sync_seq`), присваивается `nextval(...)` на
  каждом insert/update. Монотонный и независимый от часов (см. §0 п.4).

Backfill: `updatedAt = created_at`, `syncSeq = nextval(seq)` упорядоченно для
существующих строк.

Индексы:

- pull-курсор: `(user_id, sync_seq)`.
- категории: **заменить** `categories_user_name_uniq` на partial unique
  `(user_id, name) WHERE deleted_at IS NULL` (§0 п.1).

`id` остаётся `uuid`, но **генерируется на клиенте** (`crypto.randomUUID()`) —
сервер принимает его в upsert. `created_at` обязан попасть в Dexie (нужен для
клиентского `lastUsedCategoryId`, §4).

**LWW:** «выигрывает последняя по серверному `updatedAt = now()` на момент
применения» (sync-time). Не зависит от кривых клиентских часов. Компромисс:
давно отредактированная оффлайн строка, запушенная позже, перезапишет более
свежую правку с другого устройства — для личного трекера приемлемо; edit-time
LWW (клиентский `editedAt`) добавим при необходимости (§12).

## 2. Сервер: sync API + репозитории

**Новые route handlers** (REST нужен, т.к. Background Sync из SW умеет только
`fetch`, а не server actions):

- `POST /api/sync/push` — тело `{ ops: Op[] }`, где
  `Op = { opId, entity: 'expense'|'category', type: 'upsert'|'delete', id, payload }`.
  Категории в батче обрабатываются раньше трат (FK). **Каждая op — в своей
  транзакции** (§0 п.5): `requireSession` → zod-валидация → проверка владения
  (`userOwnsCategory`) → `INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE
  user_id = $user`, выставляя `updated_at = now()`, `sync_seq = nextval(seq)`,
  `deleted_at = NULL`; для delete — `SET deleted_at = now(), updated_at = now(),
  sync_seq = nextval(seq)`. Перехват `isUniqueViolation` (дубль имени) → per-op
  `{ ok: false, reason: 'name_conflict' }`. Ответ per-op:
  `{ opId, ok, id, updatedAt, syncSeq }` (или `reason` при отказе) — клиент на
  ack пишет серверные `updatedAt`/`syncSeq` в Dexie (§6).
- `GET /api/sync/pull?entity=expense|category&sinceSeq=<n>&limit=500` —
  `WHERE user_id = $user AND sync_seq > $sinceSeq ORDER BY sync_seq LIMIT n`,
  отдаёт строки **включая tombstones** + `nextSeq` + `hasMore`. Раздельный
  курсор на сущность (§0 п.3).

**Репозитории (`src/repositories/expenses.ts`, `categories.ts`):**

- `createExpense` → upsert по `(userId, id)`, принимает клиентский id.
- Все мутации → проставляют `updatedAt = now()` и `syncSeq = nextval(seq)`.
- `deleteExpense`/`deleteCategory` → soft delete (`deletedAt = now()`).
- Все чтения (`listExpenses`, `summary`, `listCategories`, `getExpense`…) →
  фильтр `deleted_at IS NULL`.
- `deleteCategory`: подсчёт трат — **только `deleted_at IS NULL`** (§0 п.2);
  при наличии живых трат → `has_expenses`.
- **Сироты-траты** (ссылаются на tombstone-категорию из-за кросс-девайс гонки):
  `summary`/история переходят с `innerJoin` (`expenses.ts:184` — молча выкидывал
  бы их и терял сумму) на **`leftJoin` + bucket «Без категории»**, чтобы деньги
  не пропадали из тоталов. Зафиксированное поведение (§9).
- Изоляция по `userId` сохраняется как есть.

Существующие server actions (`src/lib/actions/expenses.ts`) можно оставить для
прогрессивного улучшения (онлайн first-load), но основной путь записи — через
клиентский outbox → `/api/sync/push`.

## 3. Клиентский локальный стор (Dexie)

БД с именем `moneta-${userId}` (полная изоляция между аккаунтами; чистится при
логауте, §8). Stores:

- `expenses` — pk `id`, поля траты + `createdAt`, `updatedAt`, `deletedAt`,
  `syncSeq`, `syncState`.
- `categories` — аналогично.
- `outbox` — pk `opId`, `{entity, type, id, payload, createdAt, attempts, lastError}`.
- `meta` — **раздельные** `pullCursor.expenses` / `pullCursor.categories`
  (по `syncSeq`), `lastSyncAt`.

Реактивность — `dexie-react-hooks` `useLiveQuery`. **`summary` сейчас считается
SQL-агрегатом** (`expenses.ts:181-192`: sort `sum desc`, `::int`) — для оффлайна
переписываем агрегацию по категориям на TS поверх Dexie, **повторяя порядок
(sum desc) и целочисленность**, джойня против Dexie-категорий с фильтром
`deleted_at` и тем же bucket «Без категории». Общие константы/тест-векторы — на
оба пути, чтобы клиент и сервер не разъехались (§10).

## 4. Путь чтения (refactor RSC → Dexie)

Гибрид: RSC-страницы рендерят шелл и отдают начальный снапшот; `<SyncProvider>`
(client) сидирует им Dexie на первом онлайн-заходе, дальше UI читает из Dexie
через хуки (`useExpenses`, `useCategories`, `useSummary`). На оффлайн/повторных
заходах SW отдаёт кэш-шелл, клиент рендерит из Dexie.

Связка `server-data → props → router.refresh()` шире трёх файлов — на Dexie/
`useLiveQuery` уходят: `app/page.tsx`, `app/history`, summary-компоненты,
`quick-add-form` (локальный `useState(categories)`), `edit-expense-dialog`,
`use-expense-editor`, `recent-list`, `history-list`, `period-tabs`,
`category-select`, `expense-form-fields` (инлайн-создание категории),
`settings/category-manager`. `lastUsedCategoryId` (сервер сортирует по
`createdAt`, `expenses.ts:75`) пересчитывается на клиенте → потому `createdAt`
обязателен в Dexie (§1, §3).

## 5. Путь записи (outbox)

Модуль `mutations`:

- `addExpense(input)` → `id = crypto.randomUUID()`, запись в Dexie +
  `outbox(upsert)`, триггер sync.
- `updateExpense(id, patch)` → патч Dexie + `outbox(upsert полной строки)`.
- `deleteExpense(id)` → `deletedAt` в Dexie (исчезает из вьюх) +
  `outbox(delete)`.

Оптимистичность — by design (UI читает Dexie). Перехват — `onSubmit/onDelete` в
`quick-add-form.tsx`, `edit-expense-dialog.tsx`, формах категорий.
zod-валидация (`ExpenseInput`/`CategoryInput`/`expenseFormSchema` уже DB-free)
переиспользуется на клиенте до постановки в очередь.

## 6. Sync-движок

Синглтон на клиенте:

- `flush()` — слить outbox по порядку (категории раньше трат) →
  `/api/sync/push`; на per-op ack: **записать серверные `updatedAt`/`syncSeq` в
  Dexie-строку**, выставить `syncState = clean`, удалить op из outbox. На per-op
  error (`name_conflict` и пр.) — оставить в outbox и поднять реконсиляцию
  (§9) / тост; не ронять весь батч.
- `pull()` — для каждой сущности цикл `/api/sync/pull?entity=…&sinceSeq=` до
  `!hasMore`, применить merge-правило, сдвинуть **per-entity** курсор по
  `syncSeq`.
- `runSync()` = онлайн? `flush()` затем `pull()`.
- **Merge-правило на pull (per row):** если по `id` есть op в outbox →
  пропустить (локальное выигрывает до пуша); иначе применить если
  **`incoming.updatedAt > local.updatedAt`** (строгий `>`: на ack мы уже
  записали серверный `updatedAt`, поэтому собственное эхо с равным временем не
  переприменяется — нет churn); tombstone убирает из активных вьюх. Курсор
  двигается по `syncSeq` независимо от того, применилась строка или нет.
- Триггеры: `online`, `visibilitychange`/focus, после мутации (debounce),
  событие `sync` из SW (через postMessage будит `flush`) — **там, где
  поддерживается** (не iOS, §7). Бэкофф + счётчик `attempts`, индикатор статуса
  (sonner / бейдж).

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

**Feasibility-риск (проверить ДО Фазы D):** в Next 16 Turbopack — дефолтный
сборщик, а `@serwist/next` цепляется webpack-хуком (AGENTS.md: «это не тот Next»).
Проверить peer-deps `@serwist/next` на совместимость с Next 16 / Turbopack-build;
если не поддержит — **fallback на ручной Workbox / самописный SW**.

**iOS (телефон — основной таргет):**

- **Background Sync API не поддерживается** в Safari/iOS — триггер `sync` там не
  сработает; спасает деградация на `online`/`visibilitychange`/after-mutation.
  Движок **не должен зависеть** от `sync`-события.
- **Вытеснение IndexedDB** ~7 дней простоя; `persist()` на iOS слабый. Риск
  только для несинхронизированного outbox при оффлайне >7 дней — низкий, но
  держим в уме.

## 8. Auth и мульти-юзер

- Sync-эндпоинты за `requireSession` (через `src/lib/dal.ts`).
- `userId` для имени БД доступен через `authClient.useSession()`
  (`auth-client.ts:5`); кэшируем после логина.
- **Логаут:** если в outbox есть несинхронизированные op — **сначала финальный
  `flush` (онлайн), затем** `signOut` + удаление Dexie-БД + снятие регистрации
  sync. Если оффлайн и outbox непустой — предупредить (иначе тихая потеря данных).
- 401 от push/pull → стоп sync, outbox сохраняется, тост + редирект на `/login`
  при онлайне. Сессия 30 дней rolling — на реконнекте в пределах 30 дней валидна.

## 9. Краевые случаи

- **Дубль имени категории** (§0 п.1) — три сценария: два девайса оффлайн создают
  «Еда» с разными `id`; soft-delete + пересоздание того же имени; оффлайн-
  переименование в занятое имя. Partial unique index снимает кейс с tombstone;
  оставшиеся реальные конфликты ловятся per-op `name_conflict` на push →
  клиентская реконсиляция (предложить переименование / слияние; op остаётся в
  outbox до решения).
- **Категория и трата созданы оффлайн вместе** → outbox шлёт категории раньше
  трат (FK).
- **Трата-сирота** (ссылается на tombstone-категорию из-за гонки): не теряем —
  `summary`/история через `leftJoin` показывают её в bucket «Без категории»
  (§2), сумма в тотал входит.
- **Удаление непустой категории**: серверный авторитет (`has_expenses`,
  `deleted_at IS NULL`-aware), оффлайн валидируем по локальным данным; при reject
  откатываем tombstone + тост.
- **Конфликт «правка vs удаление»** → LWW по `updatedAt` (tombstone с более
  поздним временем побеждает).
- **Вытеснение IndexedDB** → persistent storage; большой первый снапшот →
  пагинация pull по `syncSeq`.

## 10. Тестирование

- **Unit (без БД):** merge-правило (LWW строгий `>` / tombstone / dirty-skip /
  ack-перезапись `updatedAt`), редьюсер outbox, клиентская агрегация summary
  (общие тест-векторы с сервером), сдвиг per-entity курсора.
- **Integration (testcontainers):** push-идемпотентность, per-op транзакции и
  partial-fail (дубль имени не роняет батч), pull пагинация/курсор по `syncSeq`,
  монотонность под параллельные транзакции, изоляция по userId, фильтр
  soft-delete, partial unique index, leftJoin-сироты. Обновить существующие
  `expenses.itest.ts`/`categories.itest.ts` под `deletedAt`/`syncSeq`.
- **Ручной E2E:** оффлайн-создание → онлайн-синк; слияние двух «устройств»
  (две Dexie-БД / две сессии); soft-delete + пересоздание имени.

## 11. Разбивка на фазы (под субагентов)

- **A. Схема + серверный фундамент** — миграция (`updatedAt`/`deletedAt`/
  `syncSeq` + sequence + backfill + индексы + partial unique index), правки
  репозиториев (upsert-by-id, soft-delete, фильтры, `deleted_at`-aware
  has_expenses, leftJoin-сироты), `/api/sync/push|pull` (per-op транзакции,
  per-entity курсор, `name_conflict`), integration-тесты. **Фиксирует контракт
  §0 — делаем первой, блокирует остальные.**
- **B. Локальный стор + чтение** — Dexie-схема (с `createdAt`/`syncSeq`/раздельными
  курсорами), `SyncProvider` + seed, хуки `useExpenses/useCategories/useSummary`,
  перевод всех читающих компонентов (§4) на Dexie, клиентская агрегация +
  `lastUsedCategoryId` + тесты.
- **C. Запись + sync-движок** — `mutations`, перенос форм на outbox, движок
  (flush/pull/runSync, ack-перезапись, триггеры, бэкофф, статус, реконсиляция
  конфликтов), тесты merge/outbox.
- **D. Service Worker / PWA** — сначала feasibility serwist+Next16 (иначе
  fallback), затем `sw.ts`, `withSerwist`, регистрация, runtime-кэш + navigation
  fallback, background-sync wake (с iOS-деградацией), persistent storage,
  update-prompt.
- **E. Харднинг** — мульти-девайс merge-тесты, FK-порядок, откат reject
  категории, 401-флоу, логаут с непустым outbox, вытеснение, пагинация большого
  снапшота.

Зависимости: **A → B → C → D**, E сквозная. A строго первой (фиксирует §0). B и
feasibility-проверку D можно вести параллельно после A.

## 12. Открытые вопросы / риски

- LWW: sync-time (рекоменд., в плане) vs edit-time с клиентским `editedAt` —
  пересмотрим при необходимости. Отдельно от §0 п.4 (это про курсор, не про LWW).
- Дублирование логики `summary` клиент/сервер — выносим общие константы и
  тест-векторы.
- Гибрид RSC+Dexie vs полностью клиентское чтение — в плане гибрид; можно
  упростить до full-client.
- serwist + Next 16 Turbopack — feasibility-риск Фазы D, fallback Workbox (§7).
- Реконсиляция `name_conflict` — UX-решение (переименование vs слияние) уточнить
  на Фазе C.
