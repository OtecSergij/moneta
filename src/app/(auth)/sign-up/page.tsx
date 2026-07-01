import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasGoogleOAuth } from "@/env";
import { getSession } from "@/lib/dal";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Регистрация — moneta" };

// Server Component. @/env parses secret server vars and must never reach a
// client bundle, so hasGoogleOAuth is resolved here and passed as a prop.
// That flag derives from runtime-only secrets (absent at build under
// SKIP_ENV_VALIDATION), so render at request time — otherwise the value is
// frozen to `false` in the build-time prerender and the button never shows.
export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (await getSession()) redirect("/");
  return <SignUpForm hasGoogle={hasGoogleOAuth} />;
}
