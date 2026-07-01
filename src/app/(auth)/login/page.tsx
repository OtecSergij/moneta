import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasGoogleOAuth } from "@/env";
import { getSession } from "@/lib/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход — moneta" };

// hasGoogleOAuth derives from runtime-only secrets (absent at build under
// SKIP_ENV_VALIDATION). Render at request time so the Google button reflects
// the live env instead of being frozen to `false` in the build-time prerender.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Send already-signed-in users home — gated on a *validated* session, not
  // mere cookie presence, so a stale cookie renders the form (see proxy.ts).
  if (await getSession()) redirect("/");
  return <LoginForm hasGoogle={hasGoogleOAuth} />;
}
