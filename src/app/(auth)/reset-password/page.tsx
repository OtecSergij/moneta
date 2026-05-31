import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Новый пароль — moneta" };

// searchParams is a Promise in Next 16. BA's reset email link lands here with
// ?token=<valid> on success, or ?error=INVALID_TOKEN if the token was bad.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const invalid = !token || error === "INVALID_TOKEN";
  return <ResetPasswordForm token={token} invalid={invalid} />;
}
