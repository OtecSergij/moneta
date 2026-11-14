# Auth для moneta — итоговые решения

## Контекст
- Next.js + собственный Postgres (Coolify на VPS)
- **Multi-user**: публичная регистрация открыта, данные общие внутри пространства и изолированы между пространствами (см. [Data isolation](#data-isolation))
- Способы входа: email/password + «Sign in with Google»

## Auth-библиотека: Better Auth
Живёт прямо в Next.js-приложении, работает с Postgres через **Drizzle**-адаптер. Из коробки даёт: email/password со scrypt-хешированием, OIDC-провайдеров одним конфигом, account linking, session cookies, email verification, password reset, rate limiting.

## Методы аутентификации
1. **Email + password** — scrypt (можно переключить на argon2)
2. **«Sign in with Google»** (OIDC) — основной способ
3. **GitHub** — не подключён: unverified emails требуют explicit linking, лишний риск

## Управление сессией: cookies + sessions в Postgres
- Подписанный HttpOnly cookie с session ID
- Таблица `session` в Postgres. Сессия кешируется в cookie на 5 минут, затем сверяется с базой
- **Без JWT**, без access/refresh-токенов

Причины: сессию можно отозвать на сервере (logout, сброс пароля; до других устройств отзыв доходит за время cookie-кеша, до 5 минут), HttpOnly cookie неуязвим к XSS, нет проблемы «где хранить токен на клиенте». JWT имеет смысл при микросервисах / мобильных клиентах / cross-domain — у нас ничего из этого нет.

### Параметры cookie / сессии
| Параметр | Значение | Почему |
|---|---|---|
| `HttpOnly` | true | XSS не достанет cookie |
| `Secure` | true (в prod) | Только HTTPS |
| `SameSite` | `Lax` | `Strict` ломает OAuth callback (cross-site redirect) |
| Lifetime | 30 дней | Compromise UX vs security |
| Expiry стратегия | **Rolling** | Активный запрос продлевает на 30 дней; неактивен 30 → разлогин |
| Update interval | 1 день | Не пишем `expires_at` в БД чаще раза в сутки |
| Сброс пароля | Инвалидирует все сессии, вход заново (`revokeSessionsOnPasswordReset`) | Стандарт безопасности |

## Email verification и password reset

Multi-user без email verification = реальные дыры:
- **Account squatting**: занять чужой email и заблокировать настоящего владельца
- **Account takeover через auto-link**: см. раздел [Account linking](#account-linking)
- **Spam регистрации**: боты создают тысячи мусорных аккаунтов

Поэтому:
- Email verification **обязателен** при регистрации (без verified email — нет доступа в приложение)
- Password reset работает через email и подтверждает email: ссылка пришла на этот адрес
- Новую ссылку подтверждения присылает вход с верным паролем и повторная регистрация на неподтверждённый адрес. Нерешённый риск этого: [auth-email-takeover.md](./auth-email-takeover.md)
- Email-провайдер — Resend (см. ниже)

## Email-провайдер: Resend

Free tier: 3 000 писем/месяц, 100/день, 1 верифицированный домен. Хватит с огромным запасом — реальный трафик это verification + изредка password reset.

API-based отправка через HTTPS, не нужен открытый SMTP-порт. У Better Auth готовый адаптер.

## Rate limiting — встроенный в Better Auth

Лимиты (storage: Postgres через адаптер Better Auth). Better Auth считает их по IP и пути запроса, не по email:
- Login: **5 попыток / 15 минут**
- Sign-up: **3 попытки / час**
- Password reset request: **3 / час**
- Email verification resend (`/send-verification-email`): **1 / минуту**. Интерфейс его не вызывает: повторную ссылку шлют вход и регистрация под своими лимитами
- OAuth callback: **10 / минуту**

Следствие: перебор одного email с разных IP эти лимиты не остановят.

Зачем это в multi-user с открытой регистрацией:
- Brute-force на чужой email (email-адрес часто известен публично)
- Credential stuffing (утечки с других сайтов)
- Регистрационный DoS (бот забивает БД + email-квоту Resend)
- Email-bombing через verification resend

IP клиента берётся из `X-Real-Ip` (`advanced.ipAddress.ipAddressHeaders`): Traefik в
Coolify перезаписывает этот заголовок адресом клиента, а первое значение
`X-Forwarded-For` клиент может подделать. Если заголовка нет, Better Auth не знает IP
и пропускает лимиты, предупредив об этом в логе один раз за процесс; поэтому
`hooks.before` в production пишет `auth.client_ip_missing` на каждый такой запрос.
Caddy (второй прокси на выбор в Coolify) `X-Real-Ip` сам не ставит и пропускает
клиентский как есть — при переходе на него нужен `header_up X-Real-Ip {remote_host}`.
После деплоя проверить логи на `auth.client_ip_missing` и «Rate limiting skipped» —
строк быть не должно — и убедиться curl'ом, что поддельные `X-Real-Ip` и
`X-Forwarded-For` не сбрасывают счётчик.

## Схема БД

Таблицы Better Auth — `user`, `session`, `account`, `verification`, `rate_limit` — описаны в `src/db/schema/auth.ts`. Таблица `account` хранит способы входа пользователя (пароль, Google); это не счета из `accounts`.

## Account linking

**Auto-link** = при OAuth-логине, если в БД уже есть юзер с тем же email, OAuth-аккаунт прикрепляется к существующему юзеру (а не создаётся второй с дубликатом email).

**Правило**: auto-link срабатывает **только если `email_verified=true` в ID-token провайдера и email локального аккаунта подтверждён** (`requireLocalEmailVerified`).

- **Google**: всегда `email_verified=true` (Google сам почтовый провайдер) → auto-link разрешён к аккаунту с подтверждённым email
- **GitHub** (если добавим): `email_verified` может быть `false` → **explicit linking only** через настройки после логина

Без проверки `email_verified` auto-link становится вектором account takeover: злоумышленник регистрирует у провайдера с непроверенным email чужого юзера, auto-link привязывает его к существующему аккаунту в нашей БД, он видит чужие данные.

Без проверки локального email то же самое с другой стороны: злоумышленник регистрирует у нас чужой email со своим паролем, владелец входит через Google, аккаунт привязывается, и пароль злоумышленника открывает его. Владелец сначала сбрасывает пароль, это подтверждает email, после чего Google привязывается.

## UX логина — generic error messages (no email enumeration)

В multi-user окружении любая утечка «существует ли email» — это enumeration oracle для атакующего.

- **Login паролем**: `«Неверный email или пароль»`, независимо от того, есть ли email в БД и привязан ли он к OAuth. Исключение: верный пароль при неподтверждённой почте даёт просьбу подтвердить email и новую ссылку — пароль уже доказан, утечки нет.
- **Password reset request**: одинаковая UI-реакция всегда (экран «Проверьте почту»). Если email есть — письмо уходит; если нет — ничего.
- **Sign-up на существующий email**: тот же ответ, что для нового — экран «Проверьте почту». Не подтверждаем явно «email уже зарегистрирован». Если адрес не подтверждён, уходит новая ссылка подтверждения; если подтверждён, ничего.
- **Ошибка входа через Google**: возврат на страницу входа или регистрации с сообщением. При `account_not_linked` сообщение предлагает войти паролем или восстановить его.
- **Account linking**: ручной привязки в интерфейсе нет, Google привязывается автоматически (см. [Account linking](#account-linking)).

## Data isolation

Multi-user + Postgres без RLS = изоляция enforce'ится на application-level. Единица изоляции — **пространство** (`spaces`): владелец и участники по приглашению видят и правят общие данные; пользователь состоит ровно в одном пространстве.

**Подход — repository pattern по `SpaceId`:**
- Репозитории общих данных (`categories`, `expenses`, `lists` с `list_items`, `accounts`, `top_ups`, `transfers`) принимают branded-тип `SpaceId`. Его выдают только `resolveSpace()` / `getMembership()` из `src/repositories/spaces.ts` — подставить `user.id` или строку от клиента TypeScript не даст.
- Страницы и server actions берут пространство только из `requireSpace()` в `src/lib/dal.ts`; `spaceId` от клиента не принимается.
- **Исключения:** `user_settings` — личные, по `userId`; `fx_rates` — глобальная таблица. Подсказки формы (последние категория и счёт) считаются внутри пространства по `created_by = я`.
- **Приватные списки** — исключение внутри пространства: список с `visibility = private` видит и правит только автор. Каждое чтение и запись списков и пунктов повторяет предикат `visibleList` (`space_id` и «общий или `created_by = я`») в том же запросе.
- **Обязательный isolation-тест**: интеграционный тест «пространство A не видит и не правит данные пространства B» — на каждую сущность.

**Приглашение в пространство:**
- Правила ссылки (одна действующая, одноразовая, срок жизни) — в `docs/product-spec.md`, раздел «Приглашение». Токен — 128 бит, срок задаёт `INVITE_TTL_DAYS`.
- `inviteGuard` (`hooks.before` Better Auth) проверяет токен **до** поиска email: на недействующий токен ответ `INVITE_INVALID` одинаков для нового и существующего адреса — оракула перебора email нет.
- **Принятый остаточный риск:** держатель *действующей* ссылки может проверить, занят ли email — новый email гасит ссылку, существующий оставляет её действующей. Проба шумная (создаёт аккаунт, шлёт письмо), тратит ссылку и доступна только тому, у кого ссылка уже есть.

**Логи:** события несут только идентификаторы, без email и без токена приглашения. Исключение: без `RESEND_API_KEY` или `EMAIL_FROM` письмо целиком печатается в лог, в любом окружении.

Postgres RLS сейчас не делаем — overhead (миграции с policies, транзакционная обёртка под `SET LOCAL`, осторожность с pgBouncer) не оправдан. Можно добавить поверх позже, если scope изменится.
