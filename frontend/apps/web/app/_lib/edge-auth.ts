// 미들웨어(Edge 런타임) 전용 JWT/쿠키 유틸 — 워크스페이스 패키지(@duing/*)를 import 하지 않는다.
// Vercel 의 Edge 번들러는 워크스페이스 모듈을 unsupported 로 거부하므로, 미들웨어가 쓰는 최소 로직만
// 앱 로컬 파일로 인라인한다. 로직은 packages/api/src/auth-context.ts 와 동일하게 유지한다.

export const AUTH_TOKEN_COOKIE_NAME = 'duing_token';

type JwtRole = 'STUDENT' | 'ADMIN';

export type JwtClaims = {
  sub: string;
  role: JwtRole;
  exp: number;
  iat?: number;
};

function isJwtClaims(value: unknown): value is JwtClaims {
  if (typeof value !== 'object' || value === null) return false;
  if (!('sub' in value) || typeof value.sub !== 'string') return false;
  if (!('role' in value) || (value.role !== 'STUDENT' && value.role !== 'ADMIN')) return false;
  if (!('exp' in value) || typeof value.exp !== 'number') return false;
  if ('iat' in value && value.iat !== undefined && typeof value.iat !== 'number') return false;
  return true;
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    // atob 은 브라우저와 Node 18+/Edge 런타임 모두에서 사용 가능.
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
