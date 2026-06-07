import type { Metadata } from "next";
import { hasGoogleOAuth } from "@/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход — moneta" };

// hasGoogleOAuth derives from runtime-only secrets (absent at build under
// SKIP_ENV_VALIDATION). Render at request time so the Google button reflects
// the live env instead of being frozen to `false` in the build-time prerender.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm hasGoogle={hasGoogleOAuth} />;
}
