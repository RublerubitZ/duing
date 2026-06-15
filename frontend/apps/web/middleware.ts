import { NextResponse, type NextRequest } from "next/server";
// Edge 런타임(미들웨어)에서는 @duing/api 배럴 대신 Edge-safe 한 auth 서브패스만 import 한다.
// 배럴은 ky 클라이언트·@duing/storage(window/localStorage) 를 끌어와 Edge 번들에서 거부된다.
import {
  AUTH_TOKEN_COOKIE_NAME,
  decodeJwt,
  isExpired,
} from "@duing/api/auth";

const STUDENT_PREFIXES = ["/apply", "/me"];
const MANAGE_PREFIX = "/manage";
const ADMIN_PREFIX = "/admin";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_TOKEN_COOKIE_NAME)?.value ?? null;
  const claims = token ? decodeJwt(token) : null;
  const isAuthenticated = !!claims && !isExpired(claims);

  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    if (isAuthenticated) {
      const next = request.nextUrl.clone();
      next.pathname = "/me";
      next.search = "";
      return NextResponse.redirect(next);
    }
    return NextResponse.next();
  }

  if (STUDENT_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isAuthenticated) {
      const next = request.nextUrl.clone();
      next.pathname = "/login";
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith(MANAGE_PREFIX)) {
    if (!isAuthenticated) {
      const next = request.nextUrl.clone();
      next.pathname = "/login";
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith(ADMIN_PREFIX)) {
    if (!isAuthenticated) {
      const next = request.nextUrl.clone();
      next.pathname = "/login";
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    if (claims?.role !== "ADMIN") {
      const next = request.nextUrl.clone();
      next.pathname = "/403";
      next.search = "";
      return NextResponse.rewrite(next);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/apply/:path*",
    "/me/:path*",
    "/manage/:path*",
    "/admin/:path*",
  ],
};
