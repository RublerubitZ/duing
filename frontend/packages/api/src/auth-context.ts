import type { AuthUser, JwtClaims } from "./auth-types";

const TOKEN_COOKIE = "duing_token";

type CookieAdapter = {
  set(token: string): void;
  clear(): void;
};

const NO_OP_ADAPTER: CookieAdapter = {
  set: () => {},
  clear: () => {},
};

let cookieAdapter: CookieAdapter = NO_OP_ADAPTER;

export function registerCookieAdapter(adapter: CookieAdapter): void {
  cookieAdapter = adapter;
}

export function setAuthToken(token: string): void {
  cookieAdapter.set(token);
}

export function clearAuthToken(): void {
  cookieAdapter.clear();
}

export function readAuthTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === TOKEN_COOKIE) return rest.join("=");
  }
  return null;
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    // atob is available in both browsers and Node 18+ (used by Next.js 15)
    const json = atob(padded);
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

export function isExpired(claims: JwtClaims, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return claims.exp <= nowSeconds;
}

export function toAuthUser(claims: JwtClaims): AuthUser {
  return { id: Number(claims.sub), role: claims.role };
}

export const AUTH_TOKEN_COOKIE_NAME = TOKEN_COOKIE;
