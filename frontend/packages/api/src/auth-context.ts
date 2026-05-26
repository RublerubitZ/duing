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

function isJwtClaims(value: unknown): value is JwtClaims {
  if (typeof value !== "object" || value === null) return false;
  if (!("sub" in value) || typeof value.sub !== "string") return false;
  if (!("role" in value) || (value.role !== "STUDENT" && value.role !== "ADMIN")) return false;
  if (!("exp" in value) || typeof value.exp !== "number") return false;
  if ("iat" in value && value.iat !== undefined && typeof value.iat !== "number") return false;
  return true;
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    // atob is available in both browsers and Node 18+ (used by Next.js 15)
    const json = atob(padded);
    const parsed: unknown = JSON.parse(json);
    return isJwtClaims(parsed) ? parsed : null;
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
