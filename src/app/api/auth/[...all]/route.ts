import { auth } from "@/lib/auth";
import { redactEmails } from "@/lib/redact-emails";

async function handler(request: Request) {
  try {
    return await auth.handler(request);
  } catch (error) {
    console.error("auth.server_error", redactEmails(error));
    return new Response(null, { status: 500 });
  }
}

export { handler as GET, handler as POST };
