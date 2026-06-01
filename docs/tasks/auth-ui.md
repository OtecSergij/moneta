# Auth UI: страницы регистрации/логина/восстановления + cleanup + protected routes

## Goal

Реализовать UI для всех auth-флоу, чтобы юзер мог зарегистрироваться,
подтвердить email, залогиниться и сбросить пароль **через браузер**. Сейчас
работает только API-уровень (`/api/auth/*` через curl) — это блокирует все
последующие продуктовые страницы.

Заодно — чистка Vercel-стартер-кода и подготовка инфраструктуры защиты
роутов (`proxy.ts` + `src/lib/dal.ts`), чтобы следующие задачи (главная,
история, настройки) могли просто использовать готовое.

## Контекст: что уже сделано

**Auth-стек настроен и работает на API:**

- [`src/lib/auth.ts`](../../src/lib/auth.ts) — `betterAuth()` instance с
  email/password + Google (env-gated) + Resend (env-gated, fallback в console).
  Все параметры сессии, rate-limits, generic-ошибки настроены.
- [`src/lib/auth-client.ts`](../../src/lib/auth-client.ts) — экспортирует
  `signIn`, `signUp`, `signOut`, `useSession` из `better-auth/react`.
- [`src/app/api/auth/[...all]/route.ts`](../../src/app/api/auth/[...all]/route.ts)
  — catch-all через `toNextJsHandler(auth)`.
- 5 таблиц в БД (user/session/account/verification/rate_limit) с uuid PK.
- `src/lib/email.ts` — обёртка вокруг Resend с fallback в `console.log`
  когда `RESEND_API_KEY` пустой (текущий dev-режим).
- `.env.local.example` показывает все нужные переменные.

**Smoke-тесты прошли** (см. историю работы): `/api/auth/ok` → 200,
`POST /api/auth/sign-up/email` создаёт юзера и логирует verification-ссылку
в дев-консоль, `sign-in` без verify отбивается 403 `EMAIL_NOT_VERIFIED`.

**Что НЕ настроено** (env-gated и работает только при заполненных
переменных):
- Google OAuth — `GOOGLE_CLIENT_ID`/`SECRET` пустые → провайдер не
  регистрируется. UI должен **прятать** кнопку «Войти через Google» когда
  переменных нет (см. `hasGoogleOAuth` в [`src/env.ts`](../../src/env.ts)).
- Resend — `RESEND_API_KEY`/`EMAIL_FROM` пустые → письма в `console.log`.

## Спека куда смотреть

1. **[`docs/business-spec.md`](../business-spec.md) §5.4** — описание страниц
   `/login`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password`.
2. **[`docs/auth-decisions.md`](../auth-decisions.md)** — целиком, особенно:
   - «UX логина — generic error messages (no email enumeration)» — критично
   - «Параметры cookie/сессии»
   - «Account linking», «Email verification»
3. **[`design-system/moneta/MASTER.md`](../../design-system/moneta/MASTER.md)**
   — токены цветов (`@theme` в `globals.css`), типографика, кнопки, формы,
   anti-patterns. Прочитать целиком — это твой UI-фундамент.
4. **[`CLAUDE.md`](../../CLAUDE.md)** — стек (react-hook-form + zod, sonner,
   lucide-react), правила («UI на русском, код на английском», «никаких эмодзи»,
   «mobile-first ≥44×44 клики, ≥16px инпуты»).
5. **[`AGENTS.md`](../../AGENTS.md)** — Next.js 16 имеет breaking changes;
   читать `node_modules/next/dist/docs/` для актуальных API. Особенно для
   `proxy.ts` (бывший `middleware.ts`) и async `cookies()`/`headers()`.

## Deliverables

### A. Auth-страницы

Все формы — `react-hook-form` + `zod` (через `@hookform/resolvers/zod`).
Все toast'ы — `sonner`. Все иконки — `lucide-react`. Тексты — на русском.

**`src/app/login/page.tsx`** — Server Component обёртка + Client form внутри:
- Поля: email, пароль
- Кнопка «Войти» (primary)
- Если `hasGoogleOAuth` (импорт из `@/env`) — кнопка «Войти через Google»
  (иначе не рендерится вообще)
- Ссылка «Забыли пароль?» → `/forgot-password`
- Ссылка «Создать аккаунт» → `/sign-up`
- При сабмите — `authClient.signIn.email({ email, password })`. На ошибку
  (любую) — `toast.error("Неверный email или пароль")`. Никогда не
  показываем «такого юзера нет» или «email не подтверждён» отдельно — это
  email enumeration. Единственное исключение: если BA вернёт код
  `EMAIL_NOT_VERIFIED`, показать «Подтвердите email — мы отправили ссылку
  на ваш адрес» (это не leak, юзер уже доказал владение паролем).
- На успех — `router.push('/')`.

**`src/app/sign-up/page.tsx`** — два состояния:
1. **Форма:** email, пароль, имя (опционально или обязательно — на твой
   выбор, BA требует `name` в схеме user). Кнопка «Зарегистрироваться» +
   «Зарегистрироваться через Google» (env-gated). Ссылка «Уже есть аккаунт?
   Войти» → `/login`.
   - Сабмит → `authClient.signUp.email({ email, password, name })`.
   - На любую ошибку (включая «email уже существует») — generic
     `toast.error("Не удалось создать аккаунт")` + ссылка «Забыли пароль?».
     Не подтверждаем что email занят.
   - На успех — переключаемся на состояние #2.
2. **«Проверьте почту»:** иконка mail-check, текст «Мы отправили ссылку
   подтверждения на {email}. Откройте письмо и нажмите ссылку.» Без кнопок
   действий — у юзера задача в почтовом ящике.

**`src/app/forgot-password/page.tsx`** — одно поле email + кнопка
«Отправить ссылку».
- Сабмит → `authClient.forgetPassword({ email, redirectTo: '/reset-password' })`
  (имя метода может отличаться — проверь BA API в `node_modules/better-auth/`).
  Атрибут `redirectTo` указывает куда BA положит юзера после клика на
  ссылку из письма.
- **Всегда** показываем одинаковое сообщение: «Если такой email
  зарегистрирован, мы отправили ссылку для сброса пароля». Независимо от
  того, есть email в БД или нет — BA сам это обеспечивает на API-уровне,
  UI просто всегда показывает одно и то же.

**`src/app/reset-password/page.tsx`** — страница куда юзер попадает после
клика на ссылку из reset-письма:
- Читает `token` из `searchParams` (это Promise в Next 16: `await searchParams`).
- Если `token` отсутствует — показать ошибку «Ссылка недействительна».
- Иначе — форма: новый пароль + повторите пароль (zod-валидация совпадения).
  Кнопка «Сбросить пароль».
- Сабмит → `authClient.resetPassword({ newPassword, token })`. На успех →
  toast «Пароль обновлён, войдите снова» + `router.push('/login')`. На ошибку
  → generic «Ссылка истекла или недействительна. Запросите новую».

**Email verification — page или нет?**
- BA по умолчанию отправляет ссылку вида
  `${BETTER_AUTH_URL}/api/auth/verify-email?token=JWT&callbackURL=/`.
- Кликнул → BA обрабатывает на API-уровне, помечает `email_verified=true`,
  редиректит на `callbackURL`.
- **Рекомендую:** **не делать** отдельную страницу `/verify-email` — оставить
  default-поведение BA. Юзер кликает в письме → попадает на главную уже
  залогиненным (у нас `autoSignInAfterVerification: true`).
- Если есть желание показать «email подтверждён» страницу — можно сделать
  `/welcome` (или подобную) и передать её в `callbackURL` (либо в
  `sendVerificationEmail` callback в `src/lib/auth.ts` собрать кастомный URL).
  Но это nice-to-have, не блокер.

### B. Protected routes infrastructure

**`src/lib/dal.ts`** — Data Access Layer для Server Components:

```ts
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}
```

Server-only — этот модуль никогда не должен попасть в client bundle.
Пакет `server-only` уже есть в Next.js 16, ничего ставить не надо.

**`proxy.ts` в корне репо** (бывший `middleware.ts` в Next ≤15 — Next 16
переименовал, см. `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`):

- Защищаемые роуты: `/`, `/history`, `/settings` — без сессии → редирект
  на `/login`.
- Auth-страницы: `/login`, `/sign-up`, `/forgot-password`, `/reset-password`
  — с сессией → редирект на `/`.
- Это **optimistic check** — просто наличие cookie, не валидация (валидация
  будет в DAL внутри RSC). Достаточно проверить `req.cookies.has(<name>)`.
- **Cookie name:** Better Auth по умолчанию `{appName}.session_token` →
  у нас appName="moneta" → должно быть `moneta.session_token`. **Проверь
  экспериментально:** залогинься через UI, открой DevTools → Application →
  Cookies, посмотри реальное имя. Если другое — поправь и оставь коммент.

```ts
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/", "/history", "/settings"];
const AUTH = ["/login", "/sign-up", "/forgot-password", "/reset-password"];

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const hasCookie = req.cookies.has("moneta.session_token"); // verify name
  const isProtected = PROTECTED.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  const isAuth = AUTH.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  if (isProtected && !hasCookie) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isAuth && hasCookie) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|svg|ico)$).*)"],
};
```

### C. Cleanup Vercel-бойлерплейта

- **`src/app/page.tsx`** — заменить весь Vercel-маркетинг на временный
  пустой плейсхолдер (главная — отдельная задача):
  ```tsx
  export default function Home() {
    return <main className="p-6"><h1 className="text-2xl">moneta</h1></main>;
  }
  ```
- **`src/app/layout.tsx`** — `metadata.title: "moneta"`, осмысленный
  `description`, `<html lang="ru">`. Шрифты Geist/Geist_Mono можно оставить
  как есть (MASTER.md может требовать другие — проверь).
- **`public/`** — удалить `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`,
  `window.svg` (после очистки `page.tsx` они никем не используются).

### D. Google OAuth — инструкция пользователю

В коде у нас Google провайдер уже **условно зарегистрирован** в `lib/auth.ts`
по флагу `hasGoogleOAuth`. Когда заполнятся env-переменные — заработает
автоматически. Кнопка в UI тоже env-gated.

**Твоя задача:** в конце работы сгенерировать пошаговую инструкцию для
пользователя в файле `docs/google-oauth-setup.md`:

1. Зайти на console.cloud.google.com → создать проект (или использовать
   существующий).
2. APIs & Services → OAuth consent screen → настроить (External, имя
   приложения, контактный email, support email).
3. Credentials → Create OAuth 2.0 Client ID → Web application.
4. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (для dev)
   - `https://moneta.<твой-домен>/api/auth/callback/google` (для prod —
     добавить когда будет домен)
5. Скопировать Client ID и Client Secret → положить в `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
6. Перезапустить `npm run dev` → кнопка «Войти через Google» появится
   автоматически.

Уточни шаги под актуальный UI Google Cloud Console, если он изменился.

## Соглашения которые надо уважать

- **UI на русском, код/коммиты/имена переменных на английском.** Все toast'ы,
  плейсхолдеры, ошибки — по-русски.
- **react-hook-form + zod** для всех форм. Zod-схемы — отдельным экспортом,
  чтобы reuse в server actions если они появятся.
- **sonner** для toast'ов. `<Toaster />` в `layout.tsx` (см. sonner docs).
- **lucide-react** для иконок. **Без эмодзи** в UI — anti-pattern из
  MASTER.md.
- **Generic ошибки** на login и forgot-password — **никогда** не leak'ать
  существование email. Single source of truth для error-текстов:
  - Login wrong: «Неверный email или пароль»
  - Sign-up failure: «Не удалось создать аккаунт»
  - Forgot password: «Если такой email зарегистрирован, мы отправили
    ссылку для сброса пароля»
- **Touch targets ≥ 44×44 px.** Все кликабельные элементы (включая
  «Забыли пароль?» ссылку).
- **Input text ≥ 16px** — иначе iOS Safari зумит при фокусе.
- **Auto-theme** — `prefers-color-scheme: dark`, никакого toggle в UI.
  Токены из MASTER.md уже это закладывают.
- **Mobile-first** — все страницы проверь на ширине 375px (iPhone SE) без
  горизонтального скролла.
- **Server Components по умолчанию.** `"use client"` только когда нужны
  hooks или event handlers (формы — нужны).
- **Async APIs в Next 16:** `cookies()`, `headers()`, `params`,
  `searchParams` — все `await`-able. См. `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.

## Acceptance — как проверить готовность

**Автоматика:**
- `npm run build` ✅
- `npm run lint` ✅
- `npm run test:run` ✅ (требует Postgres up — `npm run db:up`)

**Ручной end-to-end в браузере** (Resend пустой → ссылки в дев-консоли):
1. Открой `http://localhost:3000` → проксируешься на `/login` (нет сессии).
2. Перейди на `/sign-up`, заполни форму → видишь экран «проверьте почту».
3. В терминале `npm run dev` найди строку `[email:dev] ... Подтвердите email
   по ссылке: ...` → скопируй URL → открой в браузере → проверь что
   попал на `/` залогиненным.
4. Открой `/login` залогиненным → редирект на `/`.
5. Logout через `signOut()` (нужна кнопка или CTA — можешь временно
   на главной поставить «Выйти»).
6. `/forgot-password` → ввод email → success-сообщение.
7. В дев-консоли найди reset-ссылку → клик → форма нового пароля →
   submit → редирект на `/login` → войди с новым паролем.

**Mobile check:** Chrome DevTools → device mode → iPhone SE → пройти всё
выше без горизонтального скролла.

**Security check:**
- На `/login` ввести несуществующий email + любой пароль → должно быть
  то же сообщение что и при неверном пароле.
- На `/sign-up` ввести email который уже зарегистрирован → «Не удалось
  создать аккаунт», без подсказок что email занят.
- На `/forgot-password` ввести несуществующий email → то же
  success-сообщение что и для существующего.

## Out of scope

- **Главная (`/`)** — оставь временный плейсхолдер «moneta». Полноценная
  главная — отдельная задача (см. business-spec.md §5.1).
- **История, настройки** — не трогать (отдельные задачи).
- **PWA-манифест** — отдельная задача.
- **Google Cloud Console setup** — твоя задача описать инструкцию в
  `docs/google-oauth-setup.md`. Не нужно делать самому в консоли.
- **Resend domain + DNS** — отдельная задача (после покупки домена).
- **Восстановление session через Remember-me** — Better Auth уже 30 дней
  rolling, кнопка не нужна.

## Open questions для пользователя

В конце работы спроси у пользователя (через AskUserQuestion или просто
текстом перед коммитом):

1. **Куда редиректить после успешного login/sign-up?** Сейчас на `/`, а
   там пустой плейсхолдер. Может стоит временно на `/settings` или показать
   приветственный экран?
2. **`name` поле на sign-up — обязательное?** В БД `user.name NOT NULL`.
   Можем либо требовать в форме, либо подставлять часть до `@` из email.
   Что предпочтительнее?
3. **Logout-кнопка** — куда временно поставить, пока нет полноценного
   `/settings`? Маленькая кнопка в углу плейсхолдера главной?
4. **Шрифты** — оставляем Geist (текущий) или переключаемся на что-то из
   MASTER.md, если там предписано другое?
