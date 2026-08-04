// auth_hint 쿠키(HS256 JWT) 서버 검증 — 앱(RSC) 쪽 사용본.
//
// middleware.ts 에 같은 구현이 하나 더 있다(의도적 이중화). 미들웨어는 Vercel Edge 번들러가
// 이 모노레포의 import(워크스페이스 패키지·경로 별칭)를 인라인하지 못해 자기완결이어야 하고,
// 반대로 앱 코드가 middleware.ts 를 import 하면 그 안의 `export const config`(matcher)가
// 페이지 설정으로 오인돼 "Invalid page configuration" 경고가 난다. 그래서 한 파일로 합칠 수 없다.
// 두 구현의 드리프트는 test/auth/middleware-auth-hint.test.ts 의 교차 테스트가 잡는다 —
// 이 파일을 고치면 미들웨어 쪽도 함께 고쳐라.

export type AuthHintClaims = {
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
