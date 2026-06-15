import { NextResponse, type NextRequest } from "next/server";
// 미들웨어(Edge 런타임)는 워크스페이스 패키지를 import 하지 않는다 — Vercel Edge 번들러가
// @duing/* 를 unsupported module 로 거부하므로, JWT/쿠키 유틸을 앱 로컬 파일로 인라인해 쓴다.
import { AUTH_TOKEN_COOKIE_NAME, decodeJwt, isExpired } from "@/app/_lib/edge-auth";

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
