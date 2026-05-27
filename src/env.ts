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

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    z.treeifyError(parsed.error),
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;

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
