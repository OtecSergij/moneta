import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Data Access Layer for Server Components. `server-only` guards against this
// module ever being pulled into a client bundle.

// Memoized within a single request via React `cache` — repeated calls from
// different RSCs in the same render don't re-hit the session store.
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

// Use in protected RSC pages/actions. proxy.ts does the optimistic cookie
// redirect; this is the authoritative check. On a missing session we redirect
// (idiomatic Next) rather than throw, which would surface as a 500.
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
