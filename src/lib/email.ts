import { Resend } from "resend";
import { env, hasResend } from "@/env";

// Lazy: only construct Resend client if env has the key. In dev without keys
// we fall back to console — every email becomes a server-side log line so you
// can copy the verification/reset link out of the dev console.

const resend = hasResend ? new Resend(env.RESEND_API_KEY!) : null;

export interface EmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(args: EmailArgs): Promise<void> {
  if (!resend || !env.EMAIL_FROM) {
    console.log("[email:dev] to=%s subject=%s", args.to, args.subject);
    console.log("[email:dev] %s", args.text);
    return;
  }
  const res = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (res.error) {
    console.error("[email] resend error:", res.error);
    throw new Error(`Resend send failed: ${res.error.message}`);
  }
}
