import type { Metadata } from "next";
import { hasGoogleOAuth } from "@/env";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Регистрация — moneta" };

// Server Component. @/env parses secret server vars and must never reach a
// client bundle, so hasGoogleOAuth is resolved here and passed as a prop.
export default function SignUpPage() {
  return <SignUpForm hasGoogle={hasGoogleOAuth} />;
}
