# Auth для moneta — итоговые решения

## Контекст
- Next.js + собственный Postgres (Coolify на VPS)
- **Multi-user**: публичная регистрация открыта, каждый юзер видит только свои данные
- Способы входа: email/password + «Sign in with Google»

## Auth-библиотека: Better Auth
Живёт прямо в Next.js-приложении, работает с Postgres через **Drizzle**-адаптер. Из коробки даёт: email/password со scrypt-хешированием, OIDC-провайдеров одним конфигом, account linking, session cookies, email verification, password reset, rate limiting.

## Методы аутентификации
1. **Email + password** — scrypt (можно переключить на argon2)
2. **«Sign in with Google»** (OIDC) — основной способ
3. **GitHub** — не в первой итерации (unverified emails требуют explicit linking, лишний риск)

## Управление сессией: cookies + sessions в Postgres
- Подписанный HttpOnly cookie с session ID
- Таблица `sessions` в Postgres, валидация на каждый запрос
- **Без JWT**, без access/refresh-токенов

Причины: мгновенный logout и «выйти со всех устройств», HttpOnly cookie неуязвим к XSS, нет проблемы «где хранить токен на клиенте». JWT имеет смысл при микросервисах / мобильных клиентах / cross-domain — у нас ничего из этого нет.

### Параметры cookie / сессии
| Параметр | Значение | Почему |
|---|---|---|
| `HttpOnly` | true | XSS не достанет cookie |
| `Secure` | true (в prod) | Только HTTPS |
| `SameSite` | `Lax` | `Strict` ломает OAuth callback (cross-site redirect) |
| Lifetime | 30 дней | Compromise UX vs security |
| Expiry стратегия | **Rolling** | Активный запрос продлевает на 30 дней; неактивен 30 → разлогин |
| Update interval | 1 день | Не пишем `expires_at` в БД чаще раза в сутки |
| Смена пароля | Инвалидировать все сессии кроме текущей | Стандарт безопасности |
| «Выйти со всех устройств» | Кнопка в `/settings`, удаляет все session-rows для `user_id` | UX |

## Email verification и password reset — с первого дня

Multi-user без email verification = реальные дыры:
- **Account squatting**: занять чужой email и заблокировать настоящего владельца
- **Account takeover через auto-link**: см. раздел [Account linking](#account-linking)
- **Spam регистрации**: боты создают тысячи мусорных аккаунтов

Поэтому с первого дня:
- Email verification **обязателен** при регистрации (без verified email — нет доступа в приложение)
- Password reset работает через email
- Email-провайдер — Resend (см. ниже)

## Email-провайдер: Resend

Free tier: 3 000 писем/месяц, 100/день, 1 верифицированный домен. Хватит с огромным запасом — реальный трафик это verification + изредка password reset.

API-based отправка через HTTPS, не нужен открытый SMTP-порт. У Better Auth готовый адаптер.

**TODO (до публичного деплоя):**
1. Купить домен (поддомен типа `moneta.your-domain.com` подойдёт)
2. В Resend dashboard → Add domain → получить готовый список DNS-записей (SPF, DKIM, DMARC, return-path)
3. Вставить записи в DNS у регистратора, дождаться зелёного в Resend
4. До этого email verification не работает — публичный деплой откладываем

## Rate limiting — встроенный в Better Auth

Минимальные лимиты (storage: Postgres через адаптер Better Auth):
- Login: **5 попыток / 15 минут** на email
- Sign-up: **3 попытки / час** на IP
- Password reset request: **3 / час** на email
- Email verification resend: **1 / минуту** на email
- OAuth callback: **10 / минуту** на IP

Зачем это в multi-user с открытой регистрацией:
- Brute-force на чужой email (email-адрес часто известен публично)
- Credential stuffing (утечки с других сайтов)
- Регистрационный DoS (бот забивает БД + email-квоту Resend)
- Email-bombing через verification resend

## Схема БД

```sql
users (
  id                uuid primary key,
  email             text unique not null,
  email_verified_at timestamptz,
  created_at        timestamptz
);

accounts (
  id                  uuid primary key,
  user_id             uuid references users(id),
  provider            text not null,    -- 'password' | 'google' | 'github'
  provider_account_id text,              -- 'sub' от провайдера, null для 'password'
  password_hash       text,              -- только для provider='password'
  unique (provider, provider_account_id),
  unique (user_id, provider)
);

sessions (
  id         text primary key,           -- session ID в cookie
  user_id    uuid references users(id),
  expires_at timestamptz,
  ...
);
```

Better Auth накатит свою версию этих таблиц через миграции адаптера — схема выше для понимания модели.

## Account linking

**Auto-link** = при OAuth-логине, если в БД уже есть юзер с тем же email, OAuth-аккаунт прикрепляется к существующему юзеру (а не создаётся второй с дубликатом email).

**Правило**: auto-link срабатывает **только если `email_verified=true` в ID-token провайдера.**

- **Google**: всегда `email_verified=true` (Google сам почтовый провайдер) → auto-link разрешён
- **GitHub** (если добавим): `email_verified` может быть `false` → **explicit linking only** через настройки после логина

Без проверки `email_verified` auto-link становится вектором account takeover: злоумышленник регистрирует у провайдера с непроверенным email чужого юзера, auto-link привязывает его к существующему аккаунту в нашей БД, он видит чужие данные.

## UX логина — generic error messages (no email enumeration)

В multi-user окружении любая утечка «существует ли email» — это enumeration oracle для атакующего.

- **Login паролем**: всегда `«Неверный email или пароль»`, независимо от того, есть ли email в БД и привязан ли он к OAuth.
- **Password reset request**: одинаковая UI-реакция всегда (`«Если такой email зарегистрирован, мы отправили письмо»`). Если email есть — письмо уходит; если нет — ничего.
- **Sign-up на существующий email**: `«Не удалось создать аккаунт»` + ссылка `«забыли пароль?»`. Не подтверждаем явно «email уже зарегистрирован».
- **Account linking** делается **только из настроек после успешного логина обоими методами** — там identity уже подтверждена, утечки нет.

## Data isolation

Multi-user + Postgres без RLS = изоляция enforce'ится на application-level.

**Подход — repository pattern:**
- Все обращения к таблицам `categories` / `expenses` идут через функции вида `expensesRepo.list(userId, ...)`, `categoriesRepo.create(userId, ...)`. Без `userId` TypeScript-сигнатура не даёт вызвать.
- Middleware грузит session, кладёт `userId` в request context. Ручки берут его оттуда и передают в репозитории.
- **Обязательный isolation-тест**: интеграционный тест «юзер A не видит и не правит данные юзера B» — на каждую сущность.

Postgres RLS сейчас не делаем — overhead (миграции с policies, транзакционная обёртка под `SET LOCAL`, осторожность с pgBouncer) не оправдан для домена с двумя таблицами. Можно добавить поверх позже, если scope изменится.

## Порядок реализации
1. Поднять Postgres в Coolify, подключить Better Auth с Drizzle-адаптером, накатить миграции.
2. Email/password sign-up + login + базовый UI (формы, ошибки, redirect).
3. Repository pattern для `categories` / `expenses` + isolation-тесты — **до** того, как появятся ручки данных.
4. Купить домен, настроить DNS-записи через Resend dashboard, подключить Resend, включить email verification и password reset.
5. Завести OAuth-приложение в Google Cloud Console (`openid email profile`, non-sensitive, без app verification и без оплаты), добавить Google-провайдер с auto-link по `email_verified`.
6. UI логина / регистрации / verify / reset через хуки Better Auth (`useSession`, `signIn`, `signOut`).
7. Включить rate-limiter с лимитами выше.
8. **Позже:** GitHub или другие OIDC-провайдеры по необходимости (explicit linking only, если `email_verified` не гарантирован).
