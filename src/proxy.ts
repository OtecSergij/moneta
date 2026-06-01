import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/", "/history", "/settings"];
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
