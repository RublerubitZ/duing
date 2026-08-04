import { NextResponse, type NextRequest } from 'next/server';

// 미들웨어(Edge 런타임)는 next/server 외 어떤 모듈도 import 하지 않는다.
// Vercel 의 Edge 번들러가 이 모노레포에서 미들웨어의 import(워크스페이스 패키지·경로 별칭 모두)를
// 인라인하지 못하고 unsupported module 로 거부하므로, auth_hint 검증 로직을 파일 안에 직접 둔다.
// 반대 방향(앱 코드가 이 파일을 import)도 금지다 — `export const config`(matcher)가 페이지 설정으로
// 오인돼 "Invalid page configuration" 경고가 난다. 앱 쪽은 app/_lib/auth-hint.ts 의 쌍둥이 구현을
// 쓰고, 두 구현의 드리프트는 test/auth/middleware-auth-hint.test.ts 의 교차 테스트가 잡는다.

const AUTH_HINT_COOKIE_NAME = 'auth_hint';

type AuthHintClaims = {
  typ: 'AUTH_HINT';
  role: 'STUDENT' | 'ADMIN';
  exp: number;
};

export async function verifyAuthHint(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AuthHintClaims | null> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature, extraSegment] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature || extraSegment) return null;

    const header = decodeJson(encodedHeader);
    if (!isRecord(header) || header.alg !== 'HS256') return null;

    const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const signature = decodeBase64Url(encodedSignature);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const validSignature = await crypto.subtle.verify('HMAC', key, signature, signingInput);
    if (!validSignature) return null;

    const payload = decodeJson(encodedPayload);
    if (!isRecord(payload)) return null;
    if (Object.keys(payload).sort().join(',') !== 'exp,role,typ') return null;
    if (payload.typ !== 'AUTH_HINT') return null;
    if (payload.role !== 'STUDENT' && payload.role !== 'ADMIN') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;
    return { typ: 'AUTH_HINT', role: payload.role, exp: payload.exp };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeJson(encoded: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
}

function decodeBase64Url(encoded: string) {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const STUDENT_PREFIXES = ['/apply', '/me'];
const MANAGE_PREFIX = '/manage';
const ADMIN_PREFIX = '/admin';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authHint = request.cookies.get(AUTH_HINT_COOKIE_NAME)?.value ?? null;
  const authHintSecret = process.env.AUTH_HINT_SECRET;
  if (!authHintSecret && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_HINT_SECRET is required in production');
  }
  const claims = authHint && authHintSecret ? await verifyAuthHint(authHint, authHintSecret) : null;
  const hasValidAuthHint = claims !== null;

  if (STUDENT_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!hasValidAuthHint) {
      const next = request.nextUrl.clone();
      next.pathname = '/login';
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith(MANAGE_PREFIX)) {
    if (!hasValidAuthHint) {
      const next = request.nextUrl.clone();
      next.pathname = '/login';
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith(ADMIN_PREFIX)) {
    if (!hasValidAuthHint) {
      const next = request.nextUrl.clone();
      next.pathname = '/login';
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    if (claims.role !== 'ADMIN') {
      const next = request.nextUrl.clone();
      next.pathname = '/403';
      next.search = '';
      return NextResponse.rewrite(next);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

// /login·/signup·/forgot-password 는 의도적으로 제외한다 — auth_hint 는 라우팅 힌트일 뿐 실제
// 세션을 보장하지 않으므로, 죽은 세션의 잔존 hint 가 로그인/비밀번호 재설정 진입을 막으면 안 된다.
export const config = {
  matcher: [
    '/apply/:path*',
    '/me/:path*',
    '/manage/:path*',
    '/admin/:path*',
  ],
};
