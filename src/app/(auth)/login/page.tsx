import type { Metadata } from "next";
import { hasGoogleOAuth } from "@/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход — moneta" };

export default function LoginPage() {
  return <LoginForm hasGoogle={hasGoogleOAuth} />;
}
