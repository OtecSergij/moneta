import { NextResponse, type NextRequest } from "next/server";

// Next 16 renamed `middleware` → `proxy`. For a src/ project the file lives in
// src/ (same level as app/). This is an OPTIMISTIC cookie-presence check only,
// not session verification — the authoritative check is in the DAL
// (src/lib/dal.ts) inside Server Components.
//
// Better Auth's default session cookie is `better-auth.session_token`
// (appName does NOT affect the name); in production with secure cookies it
// gains a `__Secure-` prefix. Both are checked here.

const PROTECTED = ["/", "/history", "/settings"];
// /reset-password is intentionally NOT in AUTH: a logged-in user who clicks a
// reset link in this browser must reach the form, not get bounced to /.
const AUTH = ["/login", "/sign-up", "/forgot-password"];

function matches(path: string, routes: string[]): boolean {
  return routes.some((p) => path === p || path.startsWith(p + "/"));
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const hasSession =
    req.cookies.has("better-auth.session_token") ||
    req.cookies.has("__Secure-better-auth.session_token");

  if (matches(path, PROTECTED) && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (matches(path, AUTH) && hasSession) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|svg|ico)$).*)"],
};
