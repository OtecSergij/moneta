# Техспека: фазы 1–4

Входы: `docs/product-spec.md`, `docs/phases.md`, `docs/acceptance-checklist.md`, `docs/deferred-concepts.md`, `docs/auth-decisions.md` и холст https://claude.ai/artifact/9o9CcCapwUEJNtu4SoZE3C. Холст читается через Artifact tool (`action: "read"`, `paths`: `canvas.json` и доски `*.dc.html`), не через WebFetch. Доски — файлы `.dc.html` шириной 390 px с inline-стилями; их не рендерят (`support.js` — рантайм типа артефакта), сверяются с текстом и стилями разметки. Маленькие доски импортируют большие с параметрами состояния (`MainStates` = `Main account="none" new-cat`); `System.dc.html` описывает токены, компоненты и правила. Действуют правила `CLAUDE.md` и `AGENTS.md`: UI на русском, код на английском, комментарии только где без них непонятно, иконки только lucide (без глифов «✓», «‹»), деньги через `lib/money.ts` целыми минорами. Next 16 — по `node_modules/next/dist/docs/`: middleware — это `src/proxy.ts` с функцией `proxy`; `params` и `searchParams` — Promise; server actions, `revalidatePath`, `after`.

## Общие решения

### Модель данных (после фазы 4)

```
spaces(id uuid pk, created_at)
space_members(space_id → spaces CASCADE, user_id → user CASCADE, role space_role, joined_at)
    PK(space_id,user_id) · UNIQUE(user_id) · UNIQUE(space_id) WHERE role='owner'
space_invites(id, space_id → spaces CASCADE, token text UNIQUE, created_by → user CASCADE,
    created_at, used_at, used_by → user SET NULL, revoked_at)
    UNIQUE(space_id) WHERE used_at IS NULL AND revoked_at IS NULL
    CHECK (used_by IS NULL OR used_at IS NOT NULL)
pending_space_joins(user_id pk → user CASCADE, space_id → spaces CASCADE,
    invite_id → space_invites CASCADE, created_at)
categories(+space_id → spaces CASCADE, +created_by → user RESTRICT, −user_id)
    UNIQUE(space_id,name) · UNIQUE(id,space_id)
expenses(+space_id → spaces CASCADE, +created_by → user RESTRICT, −user_id,
    FK(category_id,space_id) → categories(id,space_id) RESTRICT   [вместо одиночного FK на category_id],
    +account_id NOT NULL → accounts CASCADE [ф.4])
    INDEX(space_id, spent_at DESC) · INDEX(space_id, created_by, created_at DESC)
    · INDEX(account_id, created_at) [ф.4]
lists(id, space_id → spaces CASCADE, created_by → user RESTRICT, name,
    visibility list_visibility DEFAULT 'shared', created_at, updated_at)
    UNIQUE(id,space_id) · INDEX(space_id, updated_at DESC)
list_items(id, list_id, space_id, created_by → user RESTRICT, text, checked, created_at, updated_at)
    FK(list_id,space_id) → lists(id,space_id) CASCADE · INDEX(list_id, checked, created_at)
accounts(id, space_id → spaces CASCADE, created_by → user RESTRICT, name, currency currency_code,
    anchor_amount_minor bigint ≥0, anchor_at, created_at, updated_at)  UNIQUE(space_id,name)
user_settings — без изменений (личное), fx_rates — без изменений (глобальное)
```

- `created_by` везде NOT NULL с RESTRICT: удаление строки `user` не должно молча стирать общие данные. Убрать участника — значит удалить его строку `space_members`.
- Пространство мигрированного пользователя имеет `id = user.id`, новые пространства — случайный uuid.
- Пространство и валюту счёта у траты проверяет репозиторий (фаза 4); составного FK на счёт нет.
- В схеме и миграциях нет литералов `'USD'|'EUR'|'RSD'|'BTC'` (AC-21); `'owner'` допустим.

### Пространство и `SpaceId`

```ts
// src/lib/space-id.ts (только тип, без БД)
declare const spaceIdBrand: unique symbol;
export type SpaceId = string & { readonly [spaceIdBrand]: true };

// src/lib/dal.ts
export const getSession = cache(...)                 // без изменений
export async function requireSession()               // без изменений
export type SpaceContext = { user: Session["user"]; spaceId: SpaceId; role: SpaceRole };
export const requireSpace = cache(async (): Promise<SpaceContext> => {
  const s = await requireSession();
  const { spaceId, role } = await resolveSpace(s.user.id);
  return { user: s.user, spaceId, role };
});
```

- `SpaceId` выдают только `resolveSpace()` и `getMembership()` из `src/repositories/spaces.ts`; только там стоит `as SpaceId`. Остальные модули, читающие `space_id` из БД (`invites.ts`, `lists.ts`, `accounts.ts` и др.), возвращают `string`.
- Страницы и actions общих данных берут пространство только из `requireSpace()`; `spaceId` от клиента не принимается. `requireSession()` остаётся в `quoteConversionAction`, `(auth)`-страницах и `/invite`.
- Все репозитории общих данных принимают `SpaceId`. Исключения: `user-settings` (по `userId`) и `fx-rates` (глобальная таблица; backfill по `SpaceId`).
- Личное внутри пространства: валюта отображения (`user_settings`) и подсказки формы (последние категория, валюта, счёт) считаются по `created_by = я`. У нового участника категория не выбрана, валюта = его валюта отображения.
- Пространство создаётся лениво при первом `requireSpace()`, поэтому неподтверждённые регистрации пространств не создают.

**`resolveSpace(userId)`** — идемпотентен и безопасен при параллельных вызовах:
1. `SELECT space_id, role FROM space_members WHERE user_id=$u` — есть строка → вернуть.
2. Иначе транзакция:
   1. `SELECT pg_advisory_xact_lock(hashtextextended($u::text, 0))`;
   2. повторная проверка членства;
   3. `DELETE FROM pending_space_joins WHERE user_id=$u RETURNING space_id` — нашлось → `INSERT space_members(role='member')`, лог `space.joined`;
   4. иначе `INSERT spaces` и `INSERT space_members(role='owner')`, лог `space.created`; если при этом `EXISTS (SELECT 1 FROM space_invites WHERE used_by=$u)` — `console.warn("space.created_despite_claim", { userId })`.
3. `isUniqueViolation` на UNIQUE(user_id) → перечитать членство, лог `space.resolve_conflict`.

### Приглашение

**Ссылка.** Токен 128 бит: `randomBytes(16).toString("base64url")`, 22 символа, хранится открытым текстом с UNIQUE (ссылку показывают повторно в настройках). URL — `${env.BETTER_AUTH_URL}/invite/${token}` (на проде `BETTER_AUTH_URL` — публичный https-адрес). У пространства одна действующая ссылка, новая отзывает старую, ссылка одноразовая.

**Действующая ссылка** (одно определение для всех запросов): `used_at IS NULL AND revoked_at IS NULL AND created_at > now() - make_interval(days => $ttl)`. `INVITE_TTL_DAYS = 7` — константа в `src/lib/invites.ts`, в SQL передаётся параметром. Частичный UNIQUE построен по `used_at IS NULL AND revoked_at IS NULL` (в предикате индекса нельзя `now()`), поэтому истёкшая неотозванная ссылка занимает слот и отзывается при создании новой. Истёкшая ссылка везде ведёт себя как недействительная.

1. **Создание.** `createInviteAction()` → `createInvite(spaceId, userId)`, в одной транзакции:
   1. `SELECT 1 FROM spaces WHERE id=$s FOR UPDATE` — от двойного тапа;
   2. вызывающий — владелец, иначе `null`;
   3. `UPDATE space_invites SET revoked_at=now()` для непогашенной и неотозванной ссылки пространства, включая истёкшую (иначе 23505 на частичном UNIQUE);
   4. `INSERT` новой ссылки.

   23505 на частичном UNIQUE (гонка вне блокировки) → вернуть уже действующую ссылку. Лог `invite.created`.
2. **Страница `/invite/[token]`.** Решение — чистая `decideInvitePage({ hasSession, tokenFormatOk, invite })` → `"redirect" | "invalid" | "form"`:
   1. есть сессия → `redirect("/")` при любом токене;
   2. токен не проходит `InviteToken` (`/^[A-Za-z0-9_-]{22}$/`) → `InviteInvalid` без запроса в БД;
   3. неизвестный, использованный, отозванный или истёкший → `InviteInvalid`; текст один, как на холсте («Её уже использовали или заменили новой…»);
   4. иначе форма. Если в `searchParams.error` что-то есть, а токен действителен, форма показывает тост «Не удалось войти через Google».
3. **Регистрация.**
   - Email: `authClient.signUp.email({ email, password, name: email.split("@")[0], inviteToken, callbackURL: "/" })`.
   - Google (кнопка только при `hasGoogleOAuth`): `authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/invite/<token>", additionalData: { inviteToken } })`.
   - На `INVITE_INVALID` форма делает `router.refresh()`, страница превращается в `InviteInvalid`. Любая другая ошибка — тост «Не удалось создать аккаунт», как в `sign-up-form.tsx`.
4. **`hooks.before` = `createAuthMiddleware(inviteGuard)`.** Срабатывает, когда `ctx.path === "/sign-up/email"` и в сыром теле есть ключ `inviteToken`, или `ctx.path === "/sign-in/social"` и есть `ctx.body.additionalData?.inviteToken`. Если значение не строка, пустое, не проходит `InviteToken` (проверка через `typeof` и `InviteToken`) или `findActiveInviteByToken` ничего не нашёл → `throw new APIError("BAD_REQUEST", { code: "INVITE_INVALID", message: "Invite is not valid" })`, лог `invite.rejected_inactive`. Проверка идёт до поиска email, иначе по ответу видно, занят ли адрес; ответ одинаков для нового и существующего email. Остальные пути хук не трогает.
5. **`user.create.before`** — запасной путь: повторная проверка через `extractInviteToken(ctx, readOAuthState)`; ссылка не действует → `return false`, лог `invite.rejected_inactive`. Для email это возможно только при гонке между проверкой и созданием; для Google — если ссылку отозвали, пока открыт экран согласия (ожидаемый исход — редирект на `errorCallbackURL`). На этот путь не опираемся: проигранная гонка даёт своё пространство и лог `invite.claim_lost`.
6. **`user.create.after`** — `claimInvite(userId, token)` в одной `db.transaction`:
   ```sql
   UPDATE space_invites SET used_at=now(), used_by=$u
     WHERE token=$t AND used_at IS NULL AND revoked_at IS NULL
       AND created_at > now() - make_interval(days => $ttl) RETURNING id, space_id;
   INSERT INTO pending_space_joins(...) ON CONFLICT DO NOTHING;
   ```
   Получилось → `invite.claimed`; пусто → `invite.claim_lost` (warn); исключение ловится → `invite.claim_failed` (error), регистрация не падает.
7. **Вход.** После подтверждения почты (в любом браузере) `autoSignInAfterVerification` ведёт на `/` → `requireSpace()` → `resolveSpace()` → участник. Google — сразу после колбэка.
8. **Существующий пользователь на приглашении:** email с действующим токеном → синтетический 200, ничего не создаётся, ссылка остаётся действующей; с недействующим → тот же `INVITE_INVALID`, что у нового email; Google → привязка без `user.create`; `/login` → обычный вход. Человек остаётся в своём пространстве.

Ссылка гасится при регистрации, а не при подтверждении почты; опечатка в email сжигает ссылку. Участник появляется в «Совместном доступе» после подтверждения почты и первого входа, до этого он в `pending_space_joins`.

**Better Auth 1.6.11.** `createAuthMiddleware`, `APIError`, `getOAuthState` импортируются из `better-auth/api`. Неизвестные поля тела (`inviteToken`) не попадают в `user`, но доступны хукам в `ctx.body`. Ошибка в `databaseHooks.user.create.after` пробрасывается наружу, поэтому хук ловит свои ошибки сам. Транзакции в `drizzleAdapter` не включать. Поведение этих API закреплено тестом `auth-invite.itest.ts`.

### Визуальная система

Фаза 1 строит новые экраны сразу на новых токенах и `kit/*`; старые токены и `src/components/ui/*` остаются, пока на них живут старые экраны (на «Тратах» в фазе 1 стили смешаны). Фаза 2 переводит остальное и удаляет старое. Состояния без доски («Проверьте почту», auth-страницы, «Настройки» у участника, ошибки полей, нативные пикеры) делаются по аналогии с ближайшей доской.

**Токены** (`globals.css`, `@theme`; имена не пересекаются со старыми):

| Токен | Значение | Где на холсте |
|---|---|---|
| `--color-page` | #F4F4F5 | фон экрана, серые окна, неактивный чип, дорожка сегмента |
| `--color-card` | #FFFFFF | карточки, белые окна, выбранный сегмент |
| `--color-line` | #E4E4E7 | линии, будущие и пустые дни |
| `--color-row-line` | #F0F0F2 | разделители строк |
| `--color-control-line` | #D4D4D8 | рамка вторичной кнопки, выключенный свитч |
| `--color-ink` / `-ink-2` / `-ink-3` | #09090B / #52525B / #71717A | текст / вторичный / третичный (символ у итога недели, неактивная вкладка) |
| `--color-ink-badge` | #3F3F46 | бейдж «Только мне», символы в CurrencySheet |
| `--color-bar-past` | #A1A1AA | прошедшие дни недели |
| `--color-select` | #18181B | выбранный чип, круглый «+», «Копировать» |
| `--color-primary` / `-primary-ink` / `-primary-soft` | #2563EB / #1D4ED8 / #E8EFFD | главная кнопка / активная вкладка / фон активной вкладки и валюты |
| `--color-error` | #DC2626 | ошибки полей |
| `--color-danger-ink` / `-danger-soft` / `-danger-deep` | #B91C1C / #FEF2F2 / #7F1D1D | удаление / его фон / текст подтверждения |
| `--color-ok` | #16A34A | «Скопировано», заполненный прогресс |
| `--color-warn-soft` / `-warn-ink` | #FEF3C7 / #92400E | иконка InviteInvalid |
| `--color-overlay` | rgba(9,9,11,.45) | фон под окном |
| `--shadow-sheet` / `--shadow-raised` | 0 -12px 32px rgba(0,0,0,.14) / 0 1px 2px rgba(0,0,0,.08) | окно / выбранный сегмент |
| `--radius-chip` / `-field` / `-card` / `-sheet` | 999px / 14px / 20px / 24px | чип / поле / карточка / окно |

- Скругления вне системных (12, 10, 16, 7, 9 px) — произвольными значениями (`rounded-[12px]`), как на доске. #8E8E96 и #F8FAFF — токены `--color-check-line` (рамка пустого чекбокса, 2 px) и `--color-edit-row` (строка в правке); #7A7A80 снапается к ближайшему токену.
- Аватар: тон по порядку участников (владелец первый, затем по `joined_at`), пары по кругу: #E8EFFD/#1D4ED8 (владелец), #FCE7F3/#9D174D, #DCFCE7/#166534, #FEF3C7/#92400E. На приглашении у владельца всегда синий. `src/lib/avatar.ts`: `avatarInitial(name)`, `avatarTone(index)`.
- Синие тона счетов по рангу: #1D4ED8, #60A5FA, #BFDBFE, дальше повторяется последний.
- Шрифт Inter; везде `tabular-nums`, символ валюты справа, иконки lucide со `strokeWidth={1.75}`.

| Элемент | Размер / вес |
|---|---|
| Заголовок окна | 20/600 |
| Заголовок блока | 17/600 |
| Основной текст | 16/400 |
| Подпись поля | 13/500 |
| Сумма в форме | 36 px на главной, 30 px в окне |
| Итог недели | 44/500, line-height 52, letter-spacing −0.03em, символ 28 px `ink-3` с отступом 8 px |

**Компоненты `src/components/kit/*`:**

| Файл → экспорт | Назначение |
|---|---|
| `button.tsx` → `Button` | `variant: "primary" \| "secondary" \| "danger" \| "select"`, `iconOnly?`, `loading?`. Главная синяя, вторичная белая с рамкой `control-line`, удаление `danger-soft/danger-ink`, `select` — «Копировать» |
| `text-field.tsx` → `TextField` | `label` (видимая 13/500 или `labelHidden` для скринридера), `variant: "default" \| "title"` (название объекта 20/600 в окне правки), `suffix` (символ валюты), `error`, проброс input-пропсов |
| `chip.tsx` → `Chip` | `pressed` (`bg-select text-white` / `bg-page text-ink`), `dotColor?`, `icon?`, проброс pointer- и contextmenu-событий для долгого нажатия |
| `segment.tsx` → `Segment<T>` | дорожка `bg-page`, выбранный `bg-card shadow-raised`; основа сегмента валют и «По категориям/По дням» |
| `switch.tsx` → `Switch` | `role="switch"`, дорожка `primary` / `control-line` |
| `bottom-sheet.tsx` → `BottomSheet` | см. ниже |
| `avatar-initial.tsx` → `AvatarInitial` | `name`, `toneIndex` |
| `google-continue-button.tsx` → `GoogleContinueButton` | белая с рамкой и цветным логотипом |

**`BottomSheet`** на Radix `Dialog` (пакет `radix-ui` уже в зависимостях):
- фон `bg-overlay`, контент внизу, `rounded-t-sheet shadow-sheet`, сверху ручка; крестика нет;
- закрывается тапом по фону, Escape и свайпом вниз; свайп тянется только за ручку и верхние 24 px; `shouldDismiss(dy, vy)` = `dy > 80 || vy > 0.5` px/мс (`src/lib/sheet-gesture.ts`);
- `tone: "white" | "gray"`: белое окно для форм, серое для меню и выбора;
- `title?` для окон создания и меню, `ariaLabel` для окон правки;
- высота учитывает `visualViewport`; окно рендерится поверх панели вкладок.

**Долгое нажатие** — `src/lib/long-press.ts` (чистый контроллер) и `src/lib/hooks/use-long-press.ts`:
- 500 мс; сдвиг больше 10 px, `pointerup`, `pointerleave`, `pointercancel` отменяют;
- после срабатывания следующий `click` проглатывается;
- `contextmenu` → `preventDefault` и открытие, но не повторно после срабатывания таймера (Android);
- CSS `-webkit-touch-callout:none; user-select:none`;
- клавиши ContextMenu и Shift+F10 шлют `contextmenu`.

### Деньги и остатки счетов

- **Остаток.** Фаза 3: остаток = якорь. Фаза 4: `balance = anchor_amount_minor − COALESCE(SUM(e.amount_minor) FILTER (WHERE e.created_at > a.anchor_at), 0)` — по времени создания записи траты, а не по `spent_at`.
- **Переякорение** (`updateAccount`): якорь двигается, только если в патче есть `balanceMinor` и он `!== loadedBalanceMinor` (остаток, который показало окно). Тогда `anchor_amount_minor = balanceMinor`, `anchor_at = now()`, лог `account.reanchored`; всё в транзакции с `SELECT … FOR UPDATE`. Правка одного имени якорь не трогает.
- **Окно счёта отправляет остаток только при изменении поля:** текст поля сравнивается с исходным; не трогали — `balanceMinor` и `loadedBalanceMinor` не отправляются. Поэтому переименование счёта с отрицательным остатком не упирается в `parseMoney`.
- **Отрицательный остаток** ввести нельзя (CHECK `>= 0`, `parseMoney` без минуса), но вычисленный бывает отрицательным: поле показывает минус, итог его учитывает, в доли он не входит.
- **Правки для отрицательных сумм (фаза 4):**
  - `divRoundHalfEven` в `src/lib/half-even.ts` — через знак и модуль: сейчас −7/2 даёт −3 вместо −4.
  - `convertMicro` уже симметричен (BigInt-деление отсекает к нулю) — без правок, только тесты.
  - `minorToInput` в `src/lib/money.ts` сохраняет ведущий «-» (сейчас берёт `Math.abs`): `minorToInput(-5000, "RUB") === "-50"`.

### Ревалидация

`src/lib/actions/revalidate.ts` (без `"use server"`), `revalidateFor(event)`:

| Событие | Пути |
|---|---|
| expense | `/`, `/history`, `/accounts` (с ф.4) |
| category | `/`, `/history` |
| displayCurrency | `/`, `/history`, `/accounts` (с ф.3) |
| invite | `/settings` |
| list | `/lists`, `revalidatePath("/lists/[id]", "page")` |
| account | `/accounts`, `/` (с ф.4) |

### Логи

Структурные, в стиле `console.info("fx.backfill_done", {...})`. В данных только id: без email и токенов.

| Область | События |
|---|---|
| Пространство | `space.created`, `space.joined`, `space.resolve_conflict`, `space.created_despite_claim` (warn) |
| Приглашение | `invite.created`, `invite.rejected_inactive`, `invite.claimed`, `invite.claim_lost` (warn), `invite.claim_failed` (error) |
| Счета и траты | `account.reanchored`, `expense.account_rejected` |

## Как проверять

**Команды** (в каждой фазе все зелёные):
```bash
npm run build
npm run lint -- --max-warnings=0
npm run test:unit
npm run test:integration   # Testcontainers postgres:18, нужен запущенный контейнер-рантайм
npx drizzle-kit generate   # должно ответить «No schema changes»
```
Точечно: `npx vitest run <файл>` (для `*.itest.ts` — `--project integration`), `npx eslint <файлы>`. `drizzle-kit` читает `DATABASE_URL` из `.env.local`; в отдельном worktree его нужно скопировать.

**Поиски** (в каждой фазе, начиная с указанной):
- с фазы 1: `rg -n "as SpaceId" src | rg -v "src/repositories/spaces.ts"` — пусто;
- старые токены. Список взят из `globals.css` на `9cf076b`: цвета `bg`, `surface`, `surface-raised`, `surface-sunken`, `border`, `text`, `text-muted`, `accent`, `accent-hover`, `danger`, `danger-hover`, `success`, `cat-*`; скругления `radius-(sm|md|lg|xl|pill)`; тени `shadow-(sm|md|lg)`.
  ```bash
  # 1) классы со старыми цветами (в т.ч. bg-bg, text-text, border-border, ring-accent/30, hover:…)
  rg -nP '(?<![\w-])(bg|text|border|ring|ring-offset|divide|outline|fill|stroke|from|via|to|placeholder|decoration|caret|accent|shadow)-(bg|surface|surface-raised|surface-sunken|border|text|text-muted|accent|accent-hover|danger|danger-hover|success|cat-[a-z]+)(?![\w-])' src
  # 2) старые тени и скругления (без токенов Tailwind молча возьмёт дефолты)
  rg -nP '(?<![\w-])shadow-(sm|md|lg)(?![\w-])' src
  rg -nP '(?<![\w-])rounded(-(t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?-(sm|md|lg|xl|pill)(?![\w-])' src
  # 3) остатки в globals.css и прямые var(--старых)
  rg -nP -- '--(color-)?(bg|surface|surface-raised|surface-sunken|border|text|text-muted|accent|accent-hover|danger|danger-hover|success|cat-[a-z]+)\s*:|--radius-(sm|md|lg|xl|pill)\s*:|--shadow-(sm|md|lg)\s*:' src/app/globals.css
  rg -nP 'var\(--(bg|surface|border|text|accent|danger|success)(-[a-z-]+)?\)' src
  ```
  Фаза 1: команды 1–2 пусты в новых файлах фазы 1. С фазы 2: все пять пусты. Новые `bg-danger-soft` и `text-danger-ink` под шаблон не попадают.

**Локальный стенд:**
1. Postgres — контейнер `moneta-pg`, база `moneta`, `DATABASE_URL` из `.env.local`; `npm run db:migrate`.
2. Сид: `npx tsx --env-file=.env.local scripts/seed-dev.ts` (демо-владелец из `SEED_EMAIL`, «Анна» — `anna@moneta.test` с тем же паролем).
3. Dev-сервер — конфигурация `moneta-dev` из `.claude/launch.json` (порт 3000).
4. Письма в dev пишутся в лог сервера: строки `[email:dev]` содержат ссылки подтверждения.
5. Перед повторными регистрациями: `docker exec moneta-pg psql -U postgres -d moneta -c 'delete from rate_limit'`.
6. Если ещё не закоммиченная миграция изменилась после применения к локальной БД (drizzle сверяет по `created_at`), базу пересоздают — только при непустом дампе из шага 1 фазы 1:
   ```bash
   test -s .omc/backup/moneta-pre-phase-1.sql || exit 1
   docker exec moneta-pg psql -U postgres -c 'DROP DATABASE IF EXISTS moneta WITH (FORCE)' -c 'CREATE DATABASE moneta'
   npm run db:migrate && npx tsx --env-file=.env.local scripts/seed-dev.ts
   ```
   Вернуть данные до фазы 1: пересоздать базу двумя первыми командами, затем `docker exec -i moneta-pg psql -U postgres -d moneta < .omc/backup/moneta-pre-phase-1.sql`.

**Сверка с холстом:**
1. По каждой доске выписать: блоки и их порядок, тексты дословно; у ключевых элементов `font-size`/`font-weight`, `color`, `background`, `border-radius`, высоту, отступы; состояния доски (props вроде `share`, `empty`, `account`, `editing`).
2. В приложении: окно 390×844, вход демо-пользователем, скриншоты. Доски выше экрана (`Main` 1735, `MainStates` 2091, `History` 1103, `HistoryDays` 1440, `List` 924–948, `SettingsInvite` 868 px) — серией скриншотов со скроллом. Числа — `getComputedStyle(el)` через JS в странице.
3. Жесты:
   - правый клик;
   - долгое нажатие — в JS `pointerdown`, ожидание 600 мс, `pointerup` и явный `click` на том же элементе (синтетический `pointerup` клика не порождает); открылась правка, а пункт не переключился и категория не выбралась;
   - свайп окна — перетаскивание от ручки вниз больше чем на 80 px;
   - тап по фону вне окна;
   - Escape.
4. Допустимы только отличия, перечисленные в разделе фазы, отличия демо-данных (суммы, даты, имена) и физически невоспроизводимые места холста с указанием причины. Любое другое отличие — дефект.

## Фаза 1 — пространство и приглашение

### Что сделать

1. Перед первой миграцией локальной БД сделать её дамп: `mkdir -p .omc/backup && docker exec moneta-pg pg_dump -U postgres moneta > .omc/backup/moneta-pre-phase-1.sql`; файл не пуст.
2. **Схема, проход A** (`src/db/schema/{spaces,categories,expenses,index}.ts`):
   - `spaces.ts`: `spaceRoleEnum = pgEnum("space_role", ["owner","member"])`, таблицы `spaces`, `space_members`, `space_invites`, `pending_space_joins` по модели данных; частичные индексы — `uniqueIndex().on().where(sql…)`;
   - `categories`: `spaceId`, `createdBy`, `unique("categories_space_name_uniq").on(spaceId, name)`, `unique("categories_id_space_uniq").on(id, spaceId)`;
   - `expenses`: `spaceId`, `createdBy`, индексы `(space_id, spent_at DESC)` и `(space_id, created_by, created_at DESC)`; одиночный `.references()` у `categoryId` заменить на `foreignKey({ name: "expenses_category_same_space_fk", columns: [categoryId, spaceId], foreignColumns: [categories.id, categories.spaceId] }).onDelete("restrict")`;
   - `userId` и старые индексы пока оставить; `npx drizzle-kit generate --name=spaces`.
3. **Дописать `0003_spaces.sql` вручную**, каждая инструкция отделена `--> statement-breakpoint`:
   1. типы и таблицы;
   2. `ADD COLUMN "space_id" uuid` и `"created_by" uuid` без NOT NULL;
   3. backfill:
      ```sql
      INSERT INTO "spaces" ("id","created_at") SELECT "id","created_at" FROM "user";
      INSERT INTO "space_members" ("space_id","user_id","role","joined_at") SELECT "id","id",'owner',"created_at" FROM "user";
      UPDATE "categories" SET "space_id"="user_id","created_by"="user_id";
      UPDATE "expenses"   SET "space_id"="user_id","created_by"="user_id";
      ```
   4. `SET NOT NULL` для четырёх колонок;
   5. UNIQUE-ограничения, `DROP CONSTRAINT "expenses_category_id_categories_id_fk"`, новые FK, индексы.
4. **Проход B:** удалить из схемы `userId`, `categories_user_name_uniq`, `categories_user_id_idx`, `expenses_user_spent_idx`; `npx drizzle-kit generate --name=drop_owner_user_id` → `0004_drop_owner_user_id.sql` только с DROP; повторный `generate` → «No schema changes». Не использовать `--custom` (ломает снимок) и переименование колонок (требует интерактивного ответа). Все ожидающие миграции применяются при старте контейнера одной транзакцией. Миграцию, попавшую в коммит, не правят — исправление только новой миграцией.
5. **Репозитории и DAL** — `src/lib/space-id.ts` и `requireSpace()` (см. «Пространство и `SpaceId`»), плюс:
   ```ts
   // src/repositories/spaces.ts (новый) — единственное место `as SpaceId`
   export type SpaceRole = "owner" | "member";
   resolveSpace(userId): Promise<{ spaceId: SpaceId; role: SpaceRole }>
   getMembership(userId): Promise<{ spaceId: SpaceId; role: SpaceRole } | null>
   listMembers(spaceId: SpaceId): Promise<Array<{ userId; name; email; role; joinedAt }>>   // владелец первым, затем joined_at
   getSpaceOwner(spaceId: SpaceId): Promise<{ userId; name } | null>

   // src/repositories/invites.ts (новый)
   createInvite(spaceId, userId): Promise<{ token: string } | null>       // null — не владелец
   getActiveInviteForOwner(spaceId, userId): Promise<{ token: string; createdAt: Date } | null> // null — не владелец или нет действующей
   findActiveInviteByToken(token): Promise<{ inviteId: string; spaceId: string; ownerName: string } | null>
   claimInvite(userId, token): Promise<{ spaceId: string } | null>       // одна транзакция

   // src/lib/invites.ts (без БД)
   INVITE_TTL_DAYS = 7
   InviteToken                       // zod /^[A-Za-z0-9_-]{22}$/
   generateInviteToken(): string
   inviteUrl(base, token): string
   displayInviteUrl(url): string     // без протокола
   extractInviteToken(ctx: { body?: unknown } | null, readOAuthState: () => Promise<unknown>): Promise<{ kind: "none" } | { kind: "invalid" } | { kind: "token"; token: string }>
   decideInvitePage(input: { hasSession: boolean; tokenFormatOk: boolean; invite: { ownerName: string } | null }): "redirect" | "invalid" | "form"

   // src/lib/db-errors.ts
   isForeignKeyViolation(err)        // 23503 по цепочке cause, как isUniqueViolation

   // src/repositories/categories.ts
   type CategoryWithUsage = Category & { hasExpenses: boolean };   // hasExpenses по всему пространству
   listCategories(spaceId: SpaceId): Promise<CategoryWithUsage[]>   // порядок создания (created_at, id); новая — в конец
   getCategory(spaceId, id)
   createCategory(spaceId, userId, input)
   updateCategory(spaceId, id, patch)
   deleteCategory(spaceId, id)       // проверка трат в пространстве + перехват 23503 → has_expenses

   // src/repositories/expenses.ts
   listExpenses(spaceId, display, opts?, index?)
   summary(spaceId, display, range, index?)
   getExpense(spaceId, id)
   createExpense(spaceId, userId, input)
   updateExpense(spaceId, id, patch) // категория только своего пространства; 23503 → null
   deleteExpense(spaceId, id)
   lastUsedCategoryId(spaceId, userId)

   // src/repositories/fx-rates.ts
   backfillRates(spaceId, deps?)
   syncSpaceRates(spaceId, { throttleMs? })   // троттлинг по spaceId
   ```
   Цвет новой категории — первый цвет палитры, не занятый в пространстве; если заняты все — `DEFAULT_CATEGORY_COLOR`.
6. **Auth.** `src/lib/auth-invite-hook.ts`: `inviteGuard(ctx)`, `beforeUserCreate(user, ctx, deps?)`, `afterUserCreate(user, ctx, deps?)` (`deps = { readOAuthState }` для тестов) по шагам 4–6 «Приглашения». В `src/lib/auth.ts`: `hooks: { before: createAuthMiddleware(inviteGuard) }`, `databaseHooks.user.create: { before: beforeUserCreate, after: afterUserCreate }`.
7. **Actions и страницы.**
   - `src/lib/actions/{categories,expenses,display-currency}.ts` → `requireSpace()` и `revalidateFor(...)` из нового `revalidate.ts`; `fx.ts` без изменений.
   - `src/lib/actions/invites.ts`: `createInviteAction(): Promise<ActionResult<{ url: string }>>`.
   - `src/app/page.tsx`: `requireSpace()`, данные по `spaceId`, подсказки по `(spaceId, user.id)`, `after(() => syncSpaceRates(spaceId, …))`; вёрстка пока старая.
   - `src/app/history/page.tsx`: `requireSpace()`; вёрстка старая.
8. **Визуальная основа:** токены в `src/app/globals.css` (старые остаются), `src/components/kit/*`, `src/lib/{long-press,sheet-gesture,avatar}.ts`, `src/lib/hooks/use-long-press.ts`.
9. **Приглашение** — доски `Invite`, `InviteInvalid`:
   - `src/app/invite/[token]/page.tsx`: server, `dynamic = "force-dynamic"`, решение через `decideInvitePage`; передаёт форме `hasGoogle={hasGoogleOAuth}` и `error`; метаданные «Приглашение — moneta».
   - `src/app/invite/[token]/invite-form.tsx` (client): `AvatarInitial` (тон 0) и «<имя владельца> приглашает вас вести траты вместе»; `GoogleContinueButton` и «или» только при `hasGoogle`; `TextField` «Email» и «Пароль», `Button` «Зарегистрироваться»; поля имени нет. Состояние «Проверьте почту» — текст из `sign-up-form.tsx` в стиле доски `Invite`. Тост на `error`.
   - `src/app/invite/[token]/invite-invalid.tsx`: иконка lucide в круге `warn-soft`/`warn-ink`, «Ссылка больше не работает», текст как на холсте, ссылка «Войти в moneta» → `/login`.
10. **Настройки** — доски `Settings` (`share`: pair, solo), `SettingsInvite`:
    - `src/app/settings/page.tsx`: по холсту, но без панели вкладок; «Назад» (lucide `ChevronLeft`): `router.back()`, только если предыдущая запись истории внутри приложения (`navigation.canGoBack`), иначе ссылка на `/` — из приложения не уводит; блоки «Совместный доступ» и «Аккаунт» (подпись «Email», адрес, «Выйти»). `getActiveInviteForOwner` вызывается только при `role === "owner"`; участнику токен не загружается.
    - `src/components/settings/sharing-section.tsx`: строки участников — аватар (тон по индексу), имя с суффиксом «· вы, владелец» / «· вы» / «· владелец», email; блок ссылки только у владельца.
    - `src/components/settings/invite-link.tsx` (client): нет действующей ссылки (нет вовсе, использована, отозвана, истекла) → «Создать ссылку-приглашение». Есть → подпись «Ссылка-приглашение», URL без протокола с многоточием, «Копировать» (`select`) копирует полный URL и на 2 с становится «Скопировано» на `bg-ok`; ниже «Создать новую ссылку».
    - `src/components/logout-button.tsx`: строка «Выйти» во всю ширину (lucide `LogOut` 20 px, `text-danger-ink`, 16/500, 56 px, линия сверху), ошибка → тост.
11. **Правка категорий** — доски `Main`, `MainStates`, `CategoryEdit`, `CategoryEditEmpty`:
    - `src/components/categories/category-chips.tsx`: на `Chip`; с `editable` долгое нажатие или правый клик → `onEdit` и чип «Новая»; без `editable` — только выбор.
    - `src/components/categories/new-category-panel.tsx`: `TextField` «Название категории», 15 цветов, «Отмена» и «Добавить»; новая категория становится выбранной; если категорий нет, панель открыта сразу.
    - `src/components/categories/category-edit-sheet.tsx`: белый `BottomSheet`, `ariaLabel="Категория"`; `TextField variant="title"` со скрытой подписью, «Цвет», корзина (`Button danger iconOnly`) только при `!hasExpenses`, «Сохранить». Удаление без подтверждения; отказ сервера `has_expenses` → тост и закрытие.
    - `src/components/expenses/expense-form-fields.tsx`: `CategoryChips`, `NewCategoryPanel`, `CategoryEditSheet` вместо `CategorySelect`, проп `categoriesEditable`.
    - `src/components/expenses/quick-add-form.tsx`: локальный список категорий (создание, обновление, удаление, `hasExpenses`).
    - `src/components/expenses/edit-expense-dialog.tsx`: чипы без `editable`.
    - `src/components/categories/color-swatches.tsx`: кольцо выбранного `0 0 0 3px <фон>, 0 0 0 5px <цвет>`.
    - `src/components/categories/use-category-form.ts`: `remove()` и цвет по умолчанию.
    - Удалить `src/components/settings/category-manager.tsx`, `src/components/categories/category-form-dialog.tsx`, `src/components/expenses/category-select.tsx`.
12. **Фабрики и сид.**
    - `src/test/factories.ts`: `mkSpaceUser()` (`mkUser` + `resolveSpace`, id пространства ≠ id пользователя), `mkMember(spaceId)`, `mkMigratedOwner()` (пространство с `id = user.id`), `mkInvite(spaceId, ownerId)`, `mkExpense(spaceId, userId, …)`. `SpaceId` фабрики получают только через `resolveSpace()`/`getMembership()`, поэтому TS не даст подставить `user.id` даже там, где они совпадают.
    - `scripts/seed-dev.ts`: сброс в порядке expenses → categories → list_items → lists (с ф.2) → accounts (с ф.3) → pending_space_joins → space_invites → space_members → spaces → user (`account`, `session` уходят каскадом). Демо-владелец и «Анна» (`anna@moneta.test`, тот же пароль) в одном пространстве; активной ссылки нет (видно состояние «пара + создать»). 6 категорий: Продукты #10B981, Кафе #F97316, Транспорт #3B82F6, Дом #F59E0B, Здоровье #EC4899, Подписки #8B5CF6. Траты по прошедшим дням текущей недели и сегодня, плюс несколько недель назад; будущих дат нет (их отвергает `maxEntryDate()`).
13. **`docs/auth-decisions.md`**, раздел «Data isolation»: изоляция по `SpaceId` и исключения из неё; `inviteGuard` до поиска email, без оракула перебора; ссылка одноразовая, новая отменяет старую, срок жизни 7 дней. Рядом с `inviteGuard` — принятый остаточный риск: держатель действующей ссылки может проверить, занят ли email (новый email гасит ссылку, существующий оставляет её); проба шумная (создаёт аккаунт, шлёт письмо), тратит ссылку и доступна только тому, у кого ссылка уже есть.

`src/proxy.ts` не меняется: `/invite/*` уже публичный.

### Как проверить

| Тест | Что утверждает |
|---|---|
| `src/db/migrations.itest.ts`, describe «phase-1 data migration» | Временная папка с журналом 0000–0002 → отдельная БД → сиды: (a) пользователь с данными, (b) без данных, (c) неподтверждённый, (d) двое с одинаковым именем категории. Затем `migrate()` всей папкой со всеми следующими миграциями. Одно пространство на пользователя (`id = user.id`) и одна строка `owner`; `space_id` и `created_by` равны прежнему `user_id`; NOT NULL; `user_id` удалён; `(space_id,name)` уникально (23505); число строк не изменилось; трату с категорией чужого пространства не вставить (23503). AC-21 и AC-24 зелёные. |
| `src/repositories/spaces.itest.ts` | Без pending → `owner` своего пространства. С pending → `member`, своего пространства нет, pending удалён. Повторный вызов ничего не меняет. `Promise.all` из 5 вызовов → одно членство и одно пространство. `listMembers`: порядок и поля. Spy на `console`: `space.created` / `space.joined`; `space.created_despite_claim` при захваченной ссылке без pending; email в данных нет. |
| `src/repositories/invites.itest.ts` | Создаёт только владелец. Новая отзывает старую, действующая одна. `Promise.all` двух `createInvite` → одна действующая, без исключения. `claimInvite` одноразовый; отозванную и использованную не погасить. `getActiveInviteForOwner` для участника → `null`. Ссылка с `created_at = now() - 7 дней + 1 мин` действует; с `- 7 дней - 1 мин` `findActiveInviteByToken`, `claimInvite`, `getActiveInviteForOwner` дают `null`; `createInvite` после истечения отзывает истёкшую строку и создаёт новую без 23505. Spy: `invite.created` / `invite.claimed` без токена в данных. |
| `src/lib/auth-invite.itest.ts` | Через `auth.api.signUpEmail`: (1) действующий токен и новый email → 200, у ссылки `used_by` = новый пользователь, есть pending. (2) Фиктивный токен с новым и с существующим email → одинаковые статус и тело (`INVITE_INVALID`), строки `user` для нового нет. (3) Действующий токен и существующий email → 200, ссылка действует. (4) Отозванный и истёкший токены → `INVITE_INVALID` с одинаковыми статусом и телом для нового и существующего email. (5) Принудительный сбой `claimInvite` (`vi.spyOn`) → регистрация 200, лог `invite.claim_failed`, затем `resolveSpace` → своё пространство. (6) OAuth: `afterUserCreate(user, ctxWithoutBody, { readOAuthState: async () => ({ inviteToken }) })` захватывает ссылку; `beforeUserCreate` с отозванным токеном из OAuth state → `false`. Если `nextCookies()` мешает `auth.api` вне Next — те же сценарии через `inviteGuard` / `beforeUserCreate` / `afterUserCreate` с фейковым `ctx` против той же БД; сценарий (2) обязателен в любом варианте. |
| `src/lib/invites.test.ts` | `InviteToken`, `displayInviteUrl`. `extractInviteToken`: из body, из OAuth state, нет → `none`, кривой → `invalid`, getter бросает → `none`. `decideInvitePage`: сессия при любом токене → `redirect`; кривой формат → `invalid`; `invite: null` → `invalid`; иначе `form`. |
| `src/repositories/isolation.itest.ts` | Пространство формы миграции M (`id = owner.id`) с участником P и свежее пространство F. Данные M видит P и не видит F. Пользователь F со своим `SpaceId` не читает и не меняет данные M. Строка `// @ts-expect-error` над `listCategories(user.id)`: если тип перестанет ловить подмену, упадёт `npm run build`. |
| `src/repositories/categories.itest.ts` | Изоляция A/B для list/get/create/update/delete. Участник видит категории владельца. `hasExpenses` по всему пространству. Удаление при трате партнёра → `has_expenses`, в том числе через 23503 (трата вставляется между проверкой и удалением, `vi.spyOn`). |
| `src/repositories/expenses.itest.ts` | Изоляция A/B для list, summary, update, delete, create с чужой категорией. Правка траты с категорией чужого пространства → `null`. Участник правит траты владельца. Подсказки двух участников и нового участника. Остальные AC на `spaceId`. |
| `src/repositories/fx-rates.itest.ts` | `backfillRates(spaceId)` учитывает даты трат обоих участников. |
| `src/lib/db-errors.test.ts` | `isForeignKeyViolation` по цепочке `cause`. |
| `src/lib/long-press.test.ts`, `sheet-gesture.test.ts`, `avatar.test.ts` | 500 мс, отмена сдвигом, проглатывание клика, нет повторного открытия по `contextmenu` после срабатывания; `shouldDismiss`; инициал и тон по индексу. |
| `src/lib/actions/fx.itest.ts` | Проходит с прежним моком `@/lib/dal`. |

Поиски: общие из «Как проверять»; `rg "category-manager|CategorySelect|category-form-dialog" src` — пусто; в `src/app/settings` нет «Категории». Новые файлы фазы для команд 1–2: `src/components/kit/**`, `src/app/invite/**`, `src/components/settings/{sharing-section,invite-link}.tsx`, `src/app/settings/page.tsx`, `src/components/categories/{category-chips,new-category-panel,category-edit-sheet}.tsx`.

Сверка с холстом:

| Доска | Состояния |
|---|---|
| `Settings` | pair у владельца; solo у одинокого владельца; у участника (без блока ссылки); владелец с истёкшей ссылкой → «Создать ссылку-приглашение» |
| `SettingsInvite` | после создания ссылки; «Скопировано»; «Создать новую ссылку» |
| `Invite` | форма |
| `InviteInvalid` | кривой, неизвестный, отозванный, использованный, истёкший токен (`created_at` сдвинуть SQL-ом в dev-БД) |
| `Main` | только чипы категорий |
| `MainStates` | панель «Новая» |
| `CategoryEdit` / `CategoryEditEmpty` | категория с тратами, без корзины / без трат, с корзиной |

Жесты: долгое нажатие и правый клик по чипу открывают правку; окно правки закрывается свайпом, тапом по фону и Escape.
Отличия от холста в фазе 1: «Настройки» без панели вкладок; на `Main` остальная вёрстка ещё старая; `Invite` без кнопки Google, если в `.env.local` нет `GOOGLE_*`; `CategoryEdit` используется только для правки — создание идёт через инлайн-панель `MainStates`.

Сценарий в браузере (стенд, сид):
1. Владелец создаёт ссылку, копирует её и выходит.
2. Регистрация по ссылке email-ом; ссылка подтверждения — из лога `[email:dev]`.
3. Участник видит траты и категории владельца и добавляет трату.
4. Владелец видит эту трату и участника в «Совместном доступе».
5. Старая ссылка → `InviteInvalid`.
6. Регистрация без ссылки → пустое своё пространство.
7. Залогиненный пользователь на `/invite/x` → `/`.
8. В логе сервера по `invite.` и `space.` есть `invite.created`, `invite.claimed`, `space.joined`, `space.created`; ни в одной строке нет email и токена.

Google-путь проверяется локально только при тестовых `GOOGLE_*` в `.env.local`.

### Готово, когда

- Общие команды и поиски зелёные.
- Таблицы пространств и участников, `space_id` и `created_by` — схема, `migrations.itest.ts`, `drizzle-kit generate` → «No schema changes».
- Миграция и уникальность имени в пространстве — «phase-1 data migration» в `migrations.itest.ts`.
- `spaceId` в одном месте DAL, репозитории принимают его — `requireSpace()`; сборка с `@ts-expect-error` в `isolation.itest.ts`; поиск `as SpaceId` пуст.
- Тест изоляции A/B — `isolation.itest.ts`, `categories.itest.ts`, `expenses.itest.ts`.
- «Совместный доступ», ссылка, копирование, одноразовость, новая отменяет старую — `invites.itest.ts`; сверка `Settings` и `SettingsInvite`.
- Страница приглашения и регистрация — `auth-invite.itest.ts`, `spaces.itest.ts`, `invites.test.ts`, сверка `Invite`/`InviteInvalid`, сценарий шаги 1–7.
- Валюта отображения и подсказки личные — `expenses.itest.ts` (подсказки двух участников и нового), `user-settings.itest.ts`.
- Правка категорий, удаление только без трат, раздела «Категории» в настройках нет — `categories.itest.ts`; сверка `Main`/`MainStates`/`CategoryEdit`/`CategoryEditEmpty` с жестами; поиски фазы.
- Проверка на проде с телефона партнёра — вне этой работы; локальный аналог — сценарий, шаги 1–4.

## Фаза 2 — списки, навигация, новый визуал

### Что сделать

1. **Схема** `src/db/schema/{lists,index}.ts`, `npx drizzle-kit generate --name=lists` → `0005_lists.sql` без ручных правок:
   - `listVisibilityEnum = pgEnum("list_visibility", ["shared","private"])`;
   - `lists`: `space_id → spaces` CASCADE, `created_by → user` RESTRICT; `name` CHECK `char_length(trim(name)) between 1 and 60`; `visibility` default `'shared'`; `updated_at` NOT NULL default now(); `unique("lists_id_space_uniq").on(id, spaceId)`;
   - `list_items`: `created_by → user` RESTRICT; `text` CHECK 1..200 после trim; `checked` default false; `foreignKey({ columns: [listId, spaceId], foreignColumns: [lists.id, lists.spaceId] }).onDelete("cascade")`; отдельного FK на `spaces` нет — пространство пункта следует из списка. `visibility` — свойство списка, пункты наследуют его через этот FK.
2. **Логика и репозиторий:**
   ```ts
   // src/lib/lists.ts (без БД): LIST_NAME_MAX=60, ITEM_TEXT_MAX=200, ListInput{name, visibility}, ItemText (zod, trim)
   // src/repositories/lists.ts
   type ListSummary = { id; name; visibility; isMine: boolean; doneCount: number; totalCount: number; updatedAt: Date };
   type ListWithItems = ListSummary & { items: Array<{ id; text; checked: boolean }> };   // ORDER BY checked, created_at, id
   listLists(spaceId, userId): Promise<ListSummary[]>              // ORDER BY updated_at DESC
   getList(spaceId, userId, listId): Promise<ListWithItems | null>
   createList(spaceId, userId, input)
   renameList(spaceId, userId, listId, name)
   setListVisibility(spaceId, userId, listId, v): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> // только автор
   resetList(spaceId, userId, listId)
   deleteList(spaceId, userId, listId)
   addItem(spaceId, userId, listId, text)
   setItemText(spaceId, userId, itemId, text)
   setItemChecked(spaceId, userId, itemId, checked: boolean)        // желаемое значение, не переключение
   deleteItem(spaceId, userId, itemId)
   ```
   - Видимость — SQL-фрагмент `visibleList(spaceId, userId)`: `lists.space_id=$s AND (lists.visibility='shared' OR lists.created_by=$u)`. Он стоит в том же выражении, что и запись (`INSERT … SELECT … FROM lists WHERE id=$l AND <visible>`, `UPDATE list_items … FROM lists WHERE … AND <visible> RETURNING`, `DELETE … USING lists …`), иначе между проверкой и записью автор успеет сделать список приватным.
   - Каждая операция со списком и пунктом (добавление, текст, отметка, удаление, сброс, переименование, приватность) в той же транзакции ставит `lists.updated_at = now()`.
   - Пустой `RETURNING` → `not_found`.
3. **Actions и доступ:** `src/lib/actions/lists.ts` — по action на операцию, `requireSpace()`, id через `z.uuid()`, `revalidateFor("list")`. `src/proxy.ts`: `PROTECTED` += `"/lists"`.
4. **Основа экранов:**
   - `src/app/globals.css`: `body` на `bg-page`; `src/app/layout.tsx`: `themeColor: "#F4F4F5"`; `src/app/manifest.ts`: `background_color: "#F4F4F5"`.
   - `src/components/nav/tab-bar.tsx` (доска `TabBar`): фиксирована внизу с safe-area; `active: "main" | "history" | "lists" | "none"`; иконки lucide; активная вкладка `bg-primary-soft text-primary-ink` 600. В фазе 2 три вкладки: «Траты», «История», «Списки».
   - `src/components/layout/app-screen.tsx` (`bg-page`, колонка `max-w-[480px]`, отступ под панель); `src/components/layout/screen-header.tsx` (h1 и слоты: чип валюты, чёрный круглый «+» lucide `Plus`, шестерёнка `Settings`).
   - `src/components/currency/display-currency-chip.tsx` и `currency-sheet.tsx` (доска `CurrencySheet`): серый `BottomSheet` «Валюта отображения» — символ в чипе, название, `Check` у выбранной; обновление оптимистичное. `src/components/currency/currency-segment.tsx` — на `kit/segment`. Удалить `src/components/settings/display-currency-switcher.tsx`.
   - `src/components/ui/{money,total-money,category-dot}.tsx` — без старых токенов; у `TotalMoney` новый проп `size="hero"` (итог недели, см. типографику).
5. **«Траты» и карточка траты** — доски `Main`, `MainEmpty`, `MainStates`, `ExpenseSheet`:
   - `src/app/page.tsx` сверху вниз: шапка «Траты» с чипом валюты и шестерёнкой; `WeekCard`; форма «Новая трата» (`AmountField`, сегмент валют, чипы категорий с «Новая», «Описание» с placeholder «Например, кофе с собой», `DateChips`, `Button primary` «Добавить трату»); «Последние» — до 10 строк «название · когда · ● категория · сумма в валюте отображения», «когда» — `formatRelativeDay` («Сегодня», «Вчера», день недели в пределах недели с понедельника, иначе дата; до гидрации — дата), пусто → блока нет; `TabBar active="main"`.
   - `src/components/expenses/week-card.tsx`: «На этой неделе · 9–15 ноября» (`weekRangeLabel`); итог `TotalMoney size="hero"`; 7 столбиков Пн–Вс: максимум 56 px, минимум 6 px, день без трат или в будущем — 4 px `bg-line`, прошедшие `bg-bar-past`, сегодня `bg-primary` с жирной подписью. Карточка не ссылка.
   - `src/components/expenses/amount-field.tsx`: 36 px (главная) или 30 px (окно), символ справа, «≈ X», когда валюта отличается от валюты отображения.
   - `src/components/expenses/date-chips.tsx`: «Сегодня», «Вчера», «Другая» с lucide `Calendar`; выбранная дата становится третьим чипом («Вт, 10 ноября», с годом вне текущего года); нативный `<input type="date">` и `showPicker()`, `max = todayISO()`.
   - `src/components/expenses/expense-sheet.tsx` вместо `edit-expense-dialog.tsx` (удалить): белое окно без заголовка — сумма 30 px; «≈»; сегмент валют (legend «Валюта») на месте счетов; чипы категорий без «Новая» и без долгого нажатия; «Описание»; дата-чипы; корзина `Button danger iconOnly` (удаляет сразу, без подтверждения) и «Сохранить».
   - `src/components/expenses/{quick-add-form,expense-form-fields,recent-list,expense-list-row,expense-row-content,use-expense-editor}.tsx` — по холсту; редактор открывает `ExpenseSheet`.
   - `src/lib/dates.ts`: `weekRange`, `weekRangeLabel` (внутри месяца «9–15 ноября», через месяц «27 октября – 2 ноября», через год — с годами), `formatChipDate`.
6. **«История»** — доски `History`, `HistoryDays`, `HistoryEmpty`; `src/app/history/page.tsx`, `src/components/history/{history-filter,period-tabs,summary-bars,history-list}.tsx`:
   - шапка как на «Тратах»; `TabBar active="history"`;
   - карточка периода: «От»/«До» с датой и lucide `Calendar`, нативный пикер; при «от» позже «до» ставится до = от; чипы «Сегодня» и «7 дней», по умолчанию «7 дней»;
   - «Итого»: сумма и «N трат», видно и при пустом периоде;
   - сегмент «По категориям/По дням» на `kit/segment`, скрыт при пустом периоде;
   - «По категориям»: точка, имя, «N трат», сумма, `ChevronDown`, полоса и %; категория раскрывается в траты;
   - «По дням»: заголовок и итог дня, траты с «● категория»;
   - `src/lib/plural.ts` — склонения («N трат»).
7. **Настройки, приглашение, вход:**
   - `src/app/settings/page.tsx`: `TabBar active="none"`.
   - `src/app/(auth)/**`, `src/components/ui/{auth-card,status-card}.tsx`, `src/components/google-sign-in.tsx`: на `kit/*` и новых токенах по образцу доски `Invite`; досок у этих экранов нет, тексты прежние. `google-sign-in.tsx` использует `GoogleContinueButton`; затем удалить `src/components/ui/google-button.tsx`.
8. **Списки:**
   - `src/app/lists/page.tsx` — доски `Lists`, `ListsEmpty`; `src/app/lists/[id]/page.tsx`: `id` через `z.uuid()`, иначе `notFound()`; невидимый список → `notFound()`. На обоих `TabBar active="lists"`.
   - `src/components/lists/list-rows.tsx`: название, бейдж «Только мне» (lucide `Lock` 12 px, `bg-page text-ink-badge`), «N из M», прогресс: `bg-ok` при N=M>0, иначе `bg-primary`; 0/0 — пустая дорожка. На экране самого списка прогресс всегда `bg-primary`.
   - `src/components/lists/list-new-sheet.tsx` (доска `ListNew`): белое окно «Новый список» — «Название», «Виден только мне» со `Switch`, по умолчанию включён; «Создать список».
   - `src/components/lists/list-screen.tsx` (client; доски `List`, `ListEmpty`, `ListRename`): шапка — «Списки» с `ChevronLeft` и кнопка меню `MoreHorizontal`; заголовок с инлайн-переименованием (Enter или `Check` сохраняет, Escape отменяет, пустое не сохраняется); прогресс; поле «Добавить пункт» — Enter добавляет в конец неотмеченных; тап по пункту отмечает оптимистично с откатом при ошибке; `not_found` → `router.replace("/lists")` и тост.
   - `src/components/lists/list-item-row.tsx` (доска `ListItemEdit`): долгое нажатие или правый клик → инлайн-правка (поле, корзина `Trash2`, `Check`); Enter или `Check` сохраняет, корзина удаляет, Escape отменяет; blur отменяет, только если `relatedTarget` вне строки (иначе тап по корзине или `Check` не дойдёт); пустое не сохраняется.
   - `src/components/lists/list-menu-sheet.tsx` (доска `ListMenu`): серое окно с именем списка в заголовке — «Сбросить галочки» (`RotateCcw`), «Переименовать» (`Pencil`; закрывает окно и включает инлайн-заголовок), «Виден только мне» со `Switch` — только у автора, «Удалить список» (`Trash2`) без подтверждения → `/lists`.
   - Автообновления нет: изменения другого участника видны после перехода между вкладками; `router.refresh()` на `visibilitychange` не делается.
9. **Фабрики и сид:** `mkList`, `mkItem`; списки «Продукты на неделю» 5/12, «Подарки на Новый год» (приватный у владельца) 2/7, «Аптечка» 1/4, «Дом: хозтовары» 0/6, «Перед поездкой» 9/9.
10. **Удалить старое** после перевода всех экранов: старые токены из `globals.css`; `src/components/ui/{button,field,text-input,currency-segment,modal}.tsx`, когда `rg` не находит их импортов.

### Как проверить

| Тест | Что утверждает |
|---|---|
| `src/repositories/lists.itest.ts` | Приватный список A не виден B (`listLists`, `getList`); все операции B с ним → `not_found` без изменений. Общий видят и правят оба. Другое пространство не видит ничего. `setListVisibility` от не-автора → `forbidden`. Каждая операция поднимает список в `listLists`. Отмеченные в конце, новый пункт в конце неотмеченных. `resetList`. Каскад при удалении. Составной FK: 23503 при чужом `space_id`. Автор делает список приватным → `setItemChecked` от B после этого → `not_found`. |
| `src/lib/plural.test.ts`, `src/lib/dates.test.ts` | 0, 1, 2, 5, 11, 21, 22, 111 трат. Подпись недели внутри месяца, через месяц и через год; `formatChipDate`. |
| `src/lib/actions/lists.itest.ts` | Моки `@/lib/dal` (как в `fx.itest.ts`) и `next/cache`. `spaceId` от клиента не принимается. Не-uuid → `{ok:false}`. Невалидный ввод → `{ok:false}`. |

Поиски: все пять команд старых токенов; `rg "Dialog.Close|aria-label=\"Закрыть\"" src`, `rg "Пока нет трат|Нет трат за выбранный период|Категорий пока нет" src`, `rg "[✓‹›]" src` — пусто.

Сверка с холстом:

| Доски | Состояния |
|---|---|
| `TabBar` | на `/`, `/history`, `/lists`, `/lists/[id]`, `/settings` (без активной) |
| `Main`, `MainEmpty`, `MainStates`, `CurrencySheet`, `ExpenseSheet` | `MainEmpty` — свежее пространство; `ExpenseSheet` — открыта с главной |
| `History`, `HistoryDays`, `HistoryEmpty` | — |
| `Lists`, `ListsEmpty`, `ListNew`, `List`, `ListEmpty`, `ListItemEdit`, `ListMenu`, `ListRename` | `ListNew` — свитч включён; `ListMenu` — у автора и у не-автора |
| `Settings`, `SettingsInvite`, `Invite`, `InviteInvalid` | `Settings`: pair, solo, участник |
| auth-страницы (login, sign-up, forgot, reset) | по образцу `Invite`, без сломанных скруглений и цветов |

Жесты: окна закрываются свайпом за ручку, тапом по фону и Escape; долгое нажатие на пункт открывает правку, тап отмечает, правый клик работает как долгое нажатие; в правке пункта тап по корзине удаляет пункт, тап по `Check` сохраняет, blur наружу отменяет; долгое нажатие на чип категории по-прежнему работает.
Отличия от холста в фазе 2: панель из 3 вкладок; на месте счетов в `Main` и `ExpenseSheet` — сегмент валют; `ListMenu` у не-автора без свитча приватности; `Invite` без кнопки Google без `GOOGLE_*`.

Сценарий в браузере: владелец и «Анна» по очереди. Общий список правят оба. Приватный список владельца «Анне» не виден; после переключения в общий — виден. Изменения другого видны после перехода между вкладками.

### Готово, когда

- Общие команды и поиски зелёные.
- Нижняя панель «Траты / История / Списки» на всех продуктовых экранах — сверка `TabBar` на пяти маршрутах.
- Экран «Списки» (название, «N из M», приватность, создание с «Виден только мне», порядок по изменению) — `lists.itest.ts`; сверка `Lists`/`ListsEmpty`/`ListNew`.
- Экран списка (галочки, отмеченные внизу, добавление, правка и удаление пункта, сброс, переименование, приватность, удаление) — `lists.itest.ts`; сверка `List`/`ListEmpty`/`ListItemEdit`/`ListMenu`/`ListRename` с жестами.
- Пункт — только текст — схема `list_items`.
- Таблицы со `space_id`, `created_by`, `visibility` — схема (`visibility` у списка, пункты наследуют через составной FK).
- Приватность и изоляция списков — `lists.itest.ts`, `actions/lists.itest.ts`.
- Панель и экраны списков совпадают с холстом — сверка.
- «Траты», «История», «Настройки», карточка траты по холсту — сверка и поиски фазы.
- Проверка на проде с двух телефонов — вне этой работы; локальный аналог — сценарий в браузере.

## Фаза 3 — счета

### Что сделать

1. **Схема** `src/db/schema/{accounts,index}.ts`, `npx drizzle-kit generate --name=accounts` → `0006_accounts.sql`:
   - `space_id → spaces` CASCADE, `created_by → user` RESTRICT;
   - `name`: CHECK 1..40 после trim; `uniqueIndex("accounts_space_name_uniq").on(spaceId, name)`;
   - `currency`: `currencyEnum("currency").notNull()` без default (AC-21); валюту счёта не меняют — в `AccountPatch` её нет;
   - `anchorAmountMinor`: bigint в режиме number, NOT NULL, CHECK `>= 0`;
   - `anchorAt`: timestamptz NOT NULL default now(), ставит только БД (`sql\`now()\``);
   - `createdAt`, `updatedAt`, `index("accounts_space_idx")`.
2. **Логика, репозиторий, actions:**
   ```ts
   // src/lib/accounts.ts (без БД): ACCOUNT_NAME_MAX=40
   //   AccountInput{ name, currency, balanceMinor: z.int().nonnegative() }
   //   AccountPatch{ name?, balanceMinor?: z.int().nonnegative(), loadedBalanceMinor?: z.int() }  // refine: balanceMinor ⇔ loadedBalanceMinor; loaded может быть < 0
   // src/lib/accounts-total.ts (чистая)
   summarizeAccounts(accounts: Array<{ id; name; currency; balanceMinor }>, display, index, today)
     : { totalMinor; unconverted; rows: Array<{ id; name; currency; balanceMinor; convertedMinor: number | null; sharePermille: number; toneIndex: number }> }
   // src/repositories/accounts.ts
   type AccountWithBalance = Account & { balanceMinor: number };
   listAccounts(spaceId): Promise<AccountWithBalance[]>          // ф.3: balance = anchor; порядок created_at
   getAccount(spaceId, id)
   createAccount(spaceId, userId, input)                         // anchor = balance, anchor_at = now()
   updateAccount(spaceId, id, patch): Promise<AccountWithBalance | null>   // правило переякорения
   deleteAccount(spaceId, id): Promise<{ ok: boolean }>
   // src/lib/actions/accounts.ts: create/update/delete; requireSpace(); z.uuid(); revalidateFor("account");
   //   23505 → «Счёт с таким названием уже есть»
   ```
   `summarizeAccounts`: курс на `today` через `convertRow` и `sumConverted`; сортировка по `convertedMinor` по убыванию, `null` в конце, при равенстве — по имени; доли (‰) только по положительным суммам; тон — по рангу.
3. **Экран** `src/app/accounts/page.tsx` — доски `Accounts`, `AccountsEmpty`: `loadRateIndex(ALL, maxEntryDate())`, `after(() => ensureRates(todayISO()))`; шапка «Счета» с чипом валюты, чёрным «+» и шестерёнкой; есть счета — итог и строки, нет — только шапка и панель; `TabBar active="accounts"`.
   - `src/components/accounts/accounts-total.tsx`: «Всего на счетах», `TotalMoney`, «По курсу на сегодня», полоса долей.
   - `src/components/accounts/account-rows.tsx`: точка тона, название, «≈ X» в валюте отображения (только если валюта счёта другая), остаток; без курса — маркер `TotalMoney`, строка в конце.
   - `src/components/accounts/account-new-sheet.tsx` (доска `AccountNew`): белое окно «Новый счёт» — `TextField` «Название», сегмент из 5 валют (по умолчанию валюта отображения), `TextField` «Остаток» с `suffix` (пусто = 0), «Добавить счёт».
   - `src/components/accounts/account-sheet.tsx` (доски `AccountSheet`, `AccountDelete`): белое окно — `TextField variant="title"` с названием, «Остаток» с `suffix`, начальное значение `minorToInput(balanceMinor)`; «Сохранить»; `Button danger` «Удалить счёт» → инлайн-подтверждение «Удалить «X»?» / «Отменить это нельзя.» с «Отмена» и «Удалить». Остаток уходит на сервер только при изменении поля.
4. **Навигация и ревалидация:** `src/components/nav/tab-bar.tsx` — 4 вкладки, `active` += `"accounts"`; `src/proxy.ts`: `PROTECTED` += `"/accounts"`; `displayCurrency` ревалидирует `/accounts`.
5. **Фабрики и сид:** `mkAccount`; 4 счёта в порядке `created_at`: «Карта USD» 1 240,50 $, «Наличные EUR» 620 €, «Наличные RSD» 48 300 RSD, «Карта RUB» 86 420 ₽ (без рублёвого счёта трата в ₽ невозможна, а счёт обязателен). Экран показывает их по сумме в валюте отображения: RUB, USD, EUR, RSD.

### Как проверить

| Тест | Что утверждает |
|---|---|
| `src/repositories/accounts.itest.ts` | Изоляция A/B для list/get/update/delete. Участник правит счета владельца. Якорь при создании. Только имя → `anchor_at` не меняется. `balanceMinor ≠ loaded` → новый якорь; `balanceMinor = loaded` → без изменений. Уникальность имени в пространстве. CHECK `>= 0`. |
| `src/lib/accounts-total.test.ts` | Фиксированный `RateIndex` (`src/test/fx-fixtures.ts`). Итог в каждой из 5 валют отображения. Тождественная валюта. Счёт без курса → `unconverted=1`, строка в конце. Сортировка и равенство сумм. Доли около 1000‰ только по положительным. Нулевой итог. |
| `src/lib/accounts.test.ts` | `AccountPatch`: `balanceMinor` без `loaded` отвергается; отрицательный `loaded` допустим; отрицательный `balanceMinor` отвергается. |

Сверка с холстом: `TabBar` (4 вкладки), `Accounts`, `AccountsEmpty`, `AccountNew`, `AccountSheet`, `AccountDelete`, `CurrencySheet` из «Счетов»; после смены валюты пересчитываются итог и «≈».
Отличие от холста в фазе 3: в `Main` и `ExpenseSheet` по-прежнему сегмент валют.

Сценарий в браузере: создать счёт; переименовать; уточнить остаток; удалить с подтверждением; сменить валюту отображения — итог и «≈» пересчитаны.

### Готово, когда

- Общие команды и поиски зелёные.
- Вкладка «Счета» — сверка `TabBar` (4 вкладки).
- Экран (валюта в шапке, итог по курсу на сегодня, сортировка по убыванию, добавление, правка названия и остатка, удаление с подтверждением) — сверка досок счетов и сценарий; `accounts-total.test.ts`.
- Таблица `accounts` с `space_id`, `created_by`, `name`, `currency`, `anchor_amount_minor`, `anchor_at` — схема.
- Тест изоляции и unit-тест итога — `accounts.itest.ts`, `accounts-total.test.ts`.

## Фаза 4 — связь трат и счетов

> **Решение после приёмки:** трат без счёта нет. `expenses.account_id` NOT NULL, FK `(account_id, space_id) → accounts(id, space_id)` ON DELETE CASCADE (миграция `0008_expense_account_required` заводит старым тратам счёт «Основной» на каждую валюту, остаток 0). Валюта траты — валюта её счёта; «Без счёта» и сегмента валют в форме нет. По умолчанию — последний счёт автора, иначе первый (`created_at`). Счетов нет → поля суммы и описания и кнопка «Добавить трату» неактивны, вместо чипов ссылка «Создайте первый счёт» на `/accounts`. Удаление счёта удаляет его траты, подтверждение называет их число.

### Что сделать

1. **Схема** `src/db/schema/expenses.ts` (импорт `accounts` относительный), `npx drizzle-kit generate --name=expense_account` → `0007_expense_account.sql`:
   ```ts
   accountId: uuid("account_id").notNull()
   foreignKey({ name: "expenses_account_same_space_fk", columns: [accountId, spaceId], foreignColumns: [accounts.id, accounts.spaceId] }).onDelete("cascade")  // + unique("accounts_id_space_uniq") на accounts
   index("expenses_account_created_idx").on(accountId, createdAt)
   ```
2. **Репозитории:**
   ```ts
   // src/repositories/expenses.ts
   ExpenseInput += accountId: z.uuid()
   createExpense / updateExpense       // проверка счёта
   lastUsedAccountId(spaceId, userId): Promise<string | null>
   // src/repositories/accounts.ts
   listAccounts(spaceId)               // остаток по формуле
   ```
   - `createExpense` и `updateExpense` проверяют итоговую строку (текущая плюс патч): счёт должен быть в том же пространстве и `currency === account.currency`, иначе `null` и лог `expense.account_rejected`. Патч с одним `accountId` проверяется против текущей валюты, патч с одной валютой — против текущего счёта.
   - `lastUsedAccountId` — счёт последней траты `created_by = я` в пространстве; трат нет → `null`.
   - `listAccounts`: формула остатка из «Деньги и остатки счетов» через LEFT JOIN с агрегатом; `sum(...)::bigint` приходит строкой → `Number()` с проверкой `Number.isSafeInteger`; порядок `created_at`.
   - `updateAccount`: правило переякорения прежнее; `loadedBalanceMinor` — вычисленный остаток, который показало окно.
3. **Отрицательные суммы:** правки `divRoundHalfEven` и `minorToInput` из «Деньги и остатки счетов».
4. **Логика формы:**
   ```ts
   // src/lib/expense-account.ts (чистая)
   defaultAccountSelection(accounts, lastAccountId): { accountId: string; currency: CurrencyCode } | null
   ```
   `src/lib/expense-form.ts`: `accountId: z.uuid()`, `toExpenseInput` передаёт его.
5. **Форма** — доски `Main`, `MainStates`, `ExpenseSheet`:
   - `src/components/expenses/account-chips.tsx`: `Chip` на каждый счёт (`created_at` по возрастанию).
   - Выбор счёта: `currency` = валюта счёта, введённое число остаётся; если оно не парсится в новой валюте, срабатывает обычная валидация.
   - Счетов в пространстве нет → вместо чипов ссылка «Создайте первый счёт» на `/accounts`, поля суммы и описания и кнопка «Добавить трату» неактивны.
   - По умолчанию (`defaultAccountSelection`): последний счёт автора, если он существует, иначе первый счёт. После сохранения траты выбранный счёт остаётся.
   - `ExpenseSheet` показывает чипы счетов с выбранным счётом траты; открывается с главной и из «Истории»: `src/app/history/page.tsx` загружает `listAccounts`, `src/components/history/**` пробрасывает счета.
   - Файлы: `src/components/expenses/{account-chips,expense-form-fields,quick-add-form,expense-sheet,use-expense-editor}.tsx`, `src/app/page.tsx`.
6. **Окно счёта:** `src/components/accounts/account-sheet.tsx` показывает отрицательный остаток с минусом; переименование такого счёта работает (остаток не отправляется, если поле не меняли).
7. **Actions:** `src/lib/actions/expenses.ts` прокидывает `accountId`; `expense` ревалидирует `/accounts`.
8. **Сид:** часть трат со счетами; `created_at` и `anchor_at` показательные, есть трата до якоря.

### Как проверить

`src/repositories/account-balance.itest.ts` (время задаётся явно через `db.update(...).set({ createdAt, anchorAt })`):
1. Трата после якоря уменьшает остаток.
2. Правка суммы меняет остаток на разницу.
3. Перенос на счёт B: A восстанавливается; B уменьшается, если трата создана после якоря B, и не меняется, если до.
4. Удаление траты восстанавливает остаток.
5. Трата до якоря не влияет, как и её правка или удаление.
6. Удаление счёта удаляет его траты, траты других счетов на месте.
7. Отказы: валюта ≠ валюте счёта; счёт другого пространства; патч только `accountId` при несовпадении валют; патч только `currency` при привязанном счёте.
8. `loaded = 585` при вычисленных 575 и правке только имени → якорь не двигается; правка значения → двигается.
9. Отрицательный остаток считается верно.
10. `lastUsedAccountId`: свой у каждого участника; `null` после удаления счёта.

| Unit-тест | Что утверждает |
|---|---|
| `src/lib/half-even.test.ts` | Отрицательные, ничьи half-even для отрицательных; существующие случаи без изменений. |
| `src/lib/money.test.ts` | `minorToInput` для отрицательных в RUB, RSD и BTC сохраняет «-»; для положительных поведение прежнее. |
| `src/lib/fx/convert.test.ts` | `convertRow(−X) === −convertRow(X)`; `sumConverted` со смешанными знаками. |
| `src/lib/expense-account.test.ts` | Последний счёт → он и его валюта; удалённый последний счёт или трат нет → первый счёт; нет счетов → `null`. |
| `src/lib/accounts-total.test.ts` | Отрицательный счёт входит в итог, но не в доли. |

Сверка с холстом: `Main` (выбран счёт, сегмента нет); `ExpenseSheet`, открытая с главной и из «Истории» (выбран счёт траты); `Accounts` (остатки по формуле); `AccountSheet` (правка остатка ставит якорь; счёт с отрицательным остатком переименовывается).

Сценарий в браузере:
1. Трата со счёта → остаток уменьшился.
2. Правка суммы → остаток пересчитан.
3. Перенос траты на другой счёт → оба остатка верны.
4. Удаление траты → остаток восстановлен.
5. Уточнить остаток, затем удалить более раннюю трату → остаток не изменился.
6. Удалить счёт → подтверждение называет число трат, траты удалены.

### Готово, когда

- Общие команды и поиски зелёные.
- `account_id` у траты обязателен, траты удаляются вместе со счётом — схема, `migrations.itest.ts`, `account-balance.itest.ts` сценарий 6.
- Выбор счёта вместо сегмента, по умолчанию последний счёт автора — сверка `Main`/`MainStates`/`ExpenseSheet`; `expense-account.test.ts`; `account-balance.itest.ts` сценарии 7 и 10.
- Остаток = якорь минус траты, созданные после якоря; «уточнить остаток» ставит новый якорь — `account-balance.itest.ts` сценарии 1–5, 8, 9.
- Тесты создания, правки суммы, переноса, удаления и трат до якоря — `account-balance.itest.ts`.
- Экран счетов показывает остатки по формуле — сверка `Accounts`, сценарий в браузере.

## Вне объёма

- Несколько пространств у одного человека и переключатель.
- Выход и удаление участника, передача владения, удаление пространства.
- Отдельные сообщения и надписи для приглашённых; поле имени на приглашении; отдельный текст для истёкшей ссылки.
- Real-time и автообновление экранов.
- Списки: шаблоны, архив, перетаскивание, количество и цена у пунктов, связь с тратами.
- Счета: приватные счета, тип счёта, копилки, заметки, смена валюты счёта, история уточнений остатка и якорей.
- Конвертации и комиссии в остатках; переводы, пополнения, леджер.
- Правка категорий из карточки траты.
- Подтверждение удаления траты, категории и списка.
- Вторая цифра на главной.
- Offline-first; фильтр «за всё время» в истории.
- Новые npm-зависимости, env-переменные, RLS.
