import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url().startsWith("postgres"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "Generate with: openssl rand -base64 32"),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

type Env = z.infer<typeof schema>;

// All variables here are RUNTIME values (DB connection, session-signing secret,
// public URL) — none are needed to produce the build artifact. During `next build`
// (CI/Docker) we set SKIP_ENV_VALIDATION=1 to bypass parsing so the build needs no
// secrets. Real validation runs at server startup via src/instrumentation.ts, so a
// misconfigured deployment fails fast at boot. Mirrors @t3-oss/env's skip behavior.
function loadEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION) {
    return process.env as unknown as Env;
  }

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "Invalid environment variables:",
      z.treeifyError(parsed.error),
    );
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}

export const env = loadEnv();

// Cross-field invariants (warn, don't crash).
if (
  (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) ||
  (!env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
) {
  console.warn(
    "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set; Google OAuth disabled.",
  );
}
if (env.RESEND_API_KEY && !env.EMAIL_FROM) {
  console.warn(
    "RESEND_API_KEY set but EMAIL_FROM missing; falling back to console logger.",
  );
}

export const hasGoogleOAuth = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);
export const hasResend = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
