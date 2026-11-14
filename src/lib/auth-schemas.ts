import * as z from "zod";

// Validation schemas for the auth forms. Exported separately so they can be
// reused in server actions later. Password rules mirror src/lib/auth.ts
// (minPasswordLength 8, maxPasswordLength 128).

// trim + lowercase BEFORE the email-format check so " A@B.com " normalizes
// cleanly instead of failing validation on stray whitespace.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Введите корректный email"));

const newPasswordField = z
  .string()
  .min(8, "Минимум 8 символов")
  .max(128, "Слишком длинный пароль");

export const loginSchema = z.object({
  email: emailField,
  // On login we never echo strength rules (that's a sign-up concern) — any
  // non-empty value is accepted client-side; Better Auth decides correctness.
  password: z.string().min(1, "Введите пароль"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const USER_NAME_MAX = 60;

export function isBlankName(name: string): boolean {
  return name.replace(/[\s\p{Cf}]/gu, "") === "";
}

export const signUpSchema = z.object({
  email: emailField,
  password: newPasswordField,
  // Optional in the form. Our auth before-hook (src/lib/auth.ts) rejects an
  // empty or blank `name`, so when this is blank the form derives one from the
  // email local-part.
  name: z
    .string()
    .trim()
    .refine((v) => Array.from(v).length <= USER_NAME_MAX, {
      error: "Слишком длинное имя",
    })
    .optional(),
});
export type SignUpValues = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: newPasswordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    error: "Пароли не совпадают",
    path: ["confirm"],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
