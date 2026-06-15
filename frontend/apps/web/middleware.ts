import { NextResponse, type NextRequest } from "next/server";

// 미들웨어(Edge 런타임)는 next/server 외 어떤 모듈도 import 하지 않는다.
// Vercel 의 Edge 번들러가 이 모노레포에서 미들웨어의 import(워크스페이스 패키지·경로 별칭 모두)를
// 인라인하지 못하고 unsupported module 로 거부하므로, JWT/쿠키 로직을 파일 안에 직접 둔다.
// (동일 로직: packages/api/src/auth-context.ts)

const AUTH_TOKEN_COOKIE_NAME = "duing_token";

type JwtRole = "STUDENT" | "ADMIN";
type JwtClaims = { sub: string; role: JwtRole; exp: number; iat?: number };

function isJwtClaims(value: unknown): value is JwtClaims {
  if (typeof value !== "object" || value === null) return false;
  if (!("sub" in value) || typeof value.sub !== "string") return false;
  if (!("role" in value) || (value.role !== "STUDENT" && value.role !== "ADMIN")) return false;
  if (!("exp" in value) || typeof value.exp !== "number") return false;
  if ("iat" in value && value.iat !== undefined && typeof value.iat !== "number") return false;
  return true;
}

function decodeJwt(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const parsed: unknown = JSON.parse(json);
    return isJwtClaims(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isExpired(claims: JwtClaims, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return claims.exp <= nowSeconds;
}

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
