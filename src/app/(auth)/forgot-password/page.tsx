import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Восстановление пароля — moneta" };

export default async function ForgotPasswordPage() {
  if (await getSession()) redirect("/");
  return <ForgotPasswordForm />;
}
