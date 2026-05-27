import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env, hasGoogleOAuth } from "@/env";
import { sendEmail } from "@/lib/email";

// Full spec: docs/auth-decisions.md. Key invariants encoded here:
//
//   - Multi-user, open registration; email verification required before login.
//   - Auto-link OAuth only when provider sends email_verified=true (Google
//     guarantees this; GitHub does NOT, so we'd add it explicit-only later).
//   - Session: 30-day rolling expiry, refreshed at most once per day.
//   - Generic responses everywhere (no email enumeration via sign-up / reset).
//   - Rate limits: BA keys by ip+path (not by email — see auth-decisions.md
//     section "Rate limiting" for the caveat).

export const auth = betterAuth({
  appName: "moneta",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

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
      // requireLocalEmailVerified defaults to true in 1.6.x — keep explicit
      // so future BA upgrades don't surprise us.
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
      "/forget-password": { window: 60 * 60, max: 3 },
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
