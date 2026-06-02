# Настройка «Войти через Google»

> **Статус:** настроено — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` заданы в
> окружении, кнопка активна. Инструкция ниже нужна на случай пересоздания
> credentials или нового окружения; при деплое — добавить prod-redirect-URI
> (шаг 3.4) и **Publish app** (см. «Прод»).

Кнопка «Войти через Google» в коде **уже реализована** и появляется в UI
автоматически, как только в окружении заданы `GOOGLE_CLIENT_ID` и
`GOOGLE_CLIENT_SECRET` (флаг `hasGoogleOAuth` в [`src/env.ts`](../src/env.ts)).
Пока переменных нет — кнопка просто не рендерится, остальной auth работает.

Эта инструкция — как получить эти две переменные в Google Cloud Console.

> UI Google Cloud Console периодически меняется (раздел «OAuth consent screen»
> переехал в «Google Auth Platform»). Названия пунктов могут чуть отличаться —
> ориентируйтесь по смыслу.

## 1. Проект

1. Откройте <https://console.cloud.google.com/>.
2. В переключателе проектов вверху — **New Project** (или выберите существующий).
3. Имя, например `moneta`. **Create**.

## 2. Экран согласия (OAuth consent / Google Auth Platform → Branding)

1. Меню → **APIs & Services → OAuth consent screen** (либо **Google Auth
   Platform**, если у вас новый UI).
2. **User type: External** → **Create**.
3. Заполните обязательное:
   - **App name:** `moneta`
   - **User support email:** ваш email
   - **Developer contact information:** ваш email
4. Сохраняйте (**Save and Continue**). На шагах **Scopes** и **Test users**
   ничего добавлять не нужно — базовых scope (email, profile, openid) для
   входа достаточно.
5. Пока приложение в статусе **Testing**, войти смогут только аккаунты из
   списка **Test users** — добавьте туда свой Google-аккаунт. Для публичного
   доступа позже нажмёте **Publish app**.

## 3. Учётные данные (OAuth Client ID)

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. **Application type: Web application**.
3. **Name:** `moneta web` (произвольно).
4. **Authorized redirect URIs** — добавьте (важно: путь именно
   `/api/auth/callback/google`, его обслуживает Better Auth):
   - dev: `http://localhost:3000/api/auth/callback/google`
   - prod (когда будет домен):
     `https://moneta.<ваш-домен>/api/auth/callback/google`
5. **Create**. Появится модалка с **Client ID** и **Client Secret** —
   скопируйте оба.

> «Authorized JavaScript origins» для server-side OAuth-флоу Better Auth
> заполнять не обязательно — достаточно redirect URI.

## 4. Переменные окружения

В `.env.local` (см. [`.env.local.example`](../.env.local.example)):

```bash
GOOGLE_CLIENT_ID=<ваш Client ID>
GOOGLE_CLIENT_SECRET=<ваш Client Secret>
```

`BETTER_AUTH_URL` должен совпадать с origin из redirect URI
(`http://localhost:3000` в dev).

## 5. Перезапуск

```bash
npm run dev
```

Кнопка «Войти через Google» / «Зарегистрироваться через Google» появится на
`/login` и `/sign-up` автоматически.

## Прод

Когда появится домен — добавьте prod-redirect-URI (шаг 3.4) в тот же OAuth
client, пропишите prod-значения env в Coolify и **Publish app** на экране
согласия, чтобы вход был доступен всем, а не только test-users.

## Account linking

В [`src/lib/auth.ts`](../src/lib/auth.ts) включён `accountLinking` с
`trustedProviders: ["google"]`: если юзер регистрировался по email/паролю, а
потом вошёл через Google с тем же (verified) адресом — аккаунты свяжутся
автоматически. Подробнее — [`docs/auth-decisions.md`](./auth-decisions.md).
