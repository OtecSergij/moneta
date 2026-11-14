import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getIp } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env, hasGoogleOAuth } from "@/env";
import {
  afterUserCreate,
  beforeUserCreate,
  inviteGuard,
} from "@/lib/auth-invite-hook";
import { USER_NAME_MAX, isBlankName } from "@/lib/auth-schemas";
import { sendEmail } from "@/lib/email";
import { redactEmails } from "@/lib/redact-emails";

// Full spec: docs/auth-decisions.md. Key invariants encoded here:
//
//   - Multi-user, open registration; email verification required before login.
//   - Google auto-links into an existing account only when that account's
//     email is verified locally.
//   - Session: 30-day rolling expiry, refreshed at most once per day.
//   - Generic responses everywhere (no email enumeration via sign-up / reset).
//   - Rate limits: BA keys by ip+path (not by email — see auth-decisions.md
//     section "Rate limiting" for the caveat).

// Counted in code points, like the char_length CHECK on user.name.
function fitName<T extends { name?: unknown }>(user: T) {
  if (typeof user.name !== "string") return;
  const chars = Array.from(user.name);
  if (chars.length <= USER_NAME_MAX) return;
  return { data: { ...user, name: chars.slice(0, USER_NAME_MAX).join("") } };
}

export const auth = betterAuth({
  appName: "moneta",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  // Better Auth logs typed addresses ("User not found { email }"); the default
  // format and levels stay, the addresses go.
  logger: {
    log: (level, message, ...args) => {
      const print =
        level === "error" ? console.error : level === "warn" ? console.warn : console.log;
      print(
        `${new Date().toISOString()} ${level.toUpperCase()} [Better Auth]: ${redactEmails(message)}`,
        ...args.map((arg) => redactEmails(arg)),
      );
    },
  },
  // Unexpected errors go to the route handler, which logs them without
  // addresses; otherwise better-call prints them whole ("# SERVER_ERROR").
  onAPIError: { throw: true },

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    // usePlural defaults to false → matches our singular schema names
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    onExistingUserSignUp: async ({ user }) => {
      if (user.emailVerified) return;
      await auth.api.sendVerificationEmail({ body: { email: user.email } });
    },
    onPasswordReset: async ({ user }) => {
      if (user.emailVerified) return;
      const ctx = await auth.$context;
      await ctx.internalAdapter.updateUser(user.id, { emailVerified: true });
    },
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Сброс пароля — moneta",
        text: `Чтобы сбросить пароль, перейдите по ссылке: ${url}`,
        html: `<p>Чтобы сбросить пароль, перейдите по <a href="${url}">ссылке</a>.</p>`,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24h
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Подтвердите email — moneta",
        text: `Подтвердите email по ссылке: ${url}`,
        html: `<p>Подтвердите email по <a href="${url}">ссылке</a>.</p>`,
      });
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Without a client IP the limiter skips the request and warns only once
      // per process; log every such request instead.
      if (ctx.request && !getIp(ctx.request, ctx.context.options)) {
        console.error("auth.client_ip_missing", { path: ctx.path });
      }
      await inviteGuard(ctx);
      const name = (ctx.body as { name?: unknown } | undefined)?.name;
      if (
        (ctx.path === "/sign-up/email" || ctx.path === "/update-user") &&
        name !== undefined
      ) {
        if (typeof name !== "string" || isBlankName(name)) {
          throw new APIError("BAD_REQUEST", { message: "Name is required" });
        }
        if (Array.from(name).length > USER_NAME_MAX) {
          throw new APIError("BAD_REQUEST", { message: "Name too long" });
        }
      }
    }),
  },

  databaseHooks: {
    // Names from paths the hook above doesn't check (OAuth profiles) are
    // trimmed to fit the DB check instead of failing it.
    user: {
      create: {
        before: async (user, ctx) => {
          if ((await beforeUserCreate(user, ctx)) === false) return false;
          return fitName(user);
        },
        after: afterUserCreate,
      },
      update: { before: async (user) => fitName(user) },
    },
  },

  socialProviders: hasGoogleOAuth
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : undefined,

  account: {
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: true,
      trustedProviders: ["google"],
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh at most once per day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5min — trade-off vs instant revocation
    },
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    database: {
      generateId: "uuid",
    },
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
    },
    // Traefik (Coolify) overwrites X-Real-Ip with the client address; the
    // first X-Forwarded-For entry is client-controlled.
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },

  rateLimit: {
    enabled: true,
    storage: "database", // persists across restarts; rate_limit table required
    customRules: {
      // NOTE: BA rate-limiter keys by ip+path, not by email.
      // See docs/auth-decisions.md "Rate limiting" for the trade-off.
      "/sign-in/email": { window: 15 * 60, max: 5 },
      "/sign-up/email": { window: 60 * 60, max: 3 },
      "/request-password-reset": { window: 60 * 60, max: 3 },
      "/send-verification-email": { window: 60, max: 1 },
      "/callback/google": { window: 60, max: 10 },
    },
  },

  // nextCookies MUST be the last plugin — it reads the RSC header to skip
  // session-cookie refresh writes during RSC renders (avoids router-cache
  // invalidation bugs in Next.js).
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
