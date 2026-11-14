import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";
import { TIME_ZONE_COOKIE, zonedNow } from "@/lib/dates";
import type { SpaceId } from "@/lib/space-id";
import { resolveSpace, type SpaceRole } from "@/repositories/spaces";

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

type SpaceContext = {
  user: Session["user"];
  spaceId: SpaceId;
  role: SpaceRole;
};

export const requireSpace = cache(async (): Promise<SpaceContext> => {
  const s = await requireSession();
  const { spaceId, role } = await resolveSpace(s.user.id);
  return { user: s.user, spaceId, role };
});

// The user's wall clock, from the zone the client stores in a cookie
// (TimeZoneCookie). Without it the server's own zone (UTC on the VPS) is used.
export async function userNow(): Promise<Date> {
  return zonedNow((await cookies()).get(TIME_ZONE_COOKIE)?.value);
}
