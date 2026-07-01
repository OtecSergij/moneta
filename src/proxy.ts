import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/", "/history", "/settings"];

function matches(path: string, routes: string[]): boolean {
  return routes.some((p) => path === p || path.startsWith(p + "/"));
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const hasSession =
    req.cookies.has("better-auth.session_token") ||
    req.cookies.has("__Secure-better-auth.session_token");

  // Optimistic-only, and only in this one safe direction: a *missing* cookie
  // definitely means "not logged in". We deliberately do NOT do the inverse
  // (bounce cookie-holders off the auth pages to "/") — cookie *presence*
  // doesn't prove the session is valid, and pairing that with requireSession()'s
  // authoritative "/"→"/login" redirect makes a stale/expired cookie ping-pong
  // forever (/login ⇄ /, ERR_TOO_MANY_REDIRECTS). The "already-signed-in → home"
  // redirect lives in the auth pages instead, gated on a *validated* session.
  if (matches(path, PROTECTED) && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|svg|ico)$).*)"],
};
