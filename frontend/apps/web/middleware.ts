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

// 동적 ID 세그먼트 형식 검사(양의 정수). 루트 app/loading.tsx 등 loading 경계 안에서 페이지가 notFound() 를 부르면
// 상태 코드가 이미 200 으로 나간 뒤라 소프트 404(200 + noindex)가 된다. 형식이 틀린 주소는 여기서 not-found 라우트로
// 넘겨 실제 404 를 낸다. `/_not-found` 는 Next 가 not-found 진입점에 쓰는 예약 이름이다
// (next/dist/shared/lib/entry-constants.js UNDERSCORE_NOT_FOUND_ROUTE) — 임의의 매칭 안 되는 경로는 나중에 루트
// catch-all 이 생기면 거기 걸린다.
// 보호 경로(/apply·/me·/manage·/admin) 아래 동적 세그먼트는 전부 숫자 id 다 — 아래 목록이 그 자리를 전수로 든다(캡처 그룹
// 하나 = id 세그먼트 하나). 빈 세그먼트는 잡지 않으므로 목록 경로는 대상이 아니다. 같은 자리의 정적 페이지 `new` 는 부정
// 전방 탐색으로 뺀다 — 정적 페이지는 빌드에 경로형 세그먼트 파일(`new.segments/_tree.segment.rsc`)이 생기고 Next 가 `.rsc`
// 를 떼고 넘기므로 `new.segments/…` 도 뺀다. `newfoo`·`new.foo` 는 id 로 판정한다.
// 퍼센트 인코딩(%31%32)·공백 섞인 값은 인코딩된 채로 오면 404, 앞단이 정규화해 숫자로 오면 통과 — 어느 쪽도 링크
// 생성처가 만들지 않는 형태라 무해하다.
// 전송 접미(`.segments`·`.prefetch`·`.json`)가 붙은 id 도 형식 위반으로 404 — 서버 모드의 클라이언트 프리페치는 페이지 URL 에
// 헤더(Next-Router-Segment-Prefetch)로 요청하고 경로형은 output: export 전용이다(next/dist/client/components/segment-cache/
// cache.js). 떼면 페이지가 원문을 받아 다시 소프트 404 가 된다.
// 새 id 라우트를 만들면 이 목록부터 고칠 것 — test 의 커버리지 가드가 빠진 자리를, 라우트 가드가 가려진 정적 페이지를 잡는다.
// 판정 기준은 app/_lib/idParam.ts 의 parsePositiveIdParam 과 같다(이 파일은 앱 코드를 import 못 해 정규식을 따로 둔다)
// — 둘의 드리프트는 test/auth/middleware-auth-hint.test.ts 의 대조 테스트가 잡는다.
const ID_ROUTE_PATTERNS = [
  /^\/apply\/([^/]+)/,
  /^\/me\/(?:applications|fees)\/([^/]+)/,
  /^\/me\/inquiries\/(?!new(?:$|\/|\.segments\/))([^/]+)/,
  /^\/admin\/(?:fees|inquiries|leader-succession|promotion-requests|recruitments|reports|facility-bookings\/submission)\/([^/]+)/,
  /^\/admin\/(?:clubs|faqs|global-events|notices|promotions)\/(?!new(?:$|\/|\.segments\/))([^/]+)/,
  /^\/manage\/clubs\/([^/]+)(?:\/fees\/([^/]+)|\/recruitments\/(?!new(?:$|\/|\.segments\/))([^/]+)(?:\/applicants\/([^/]+)|\/interview\/rounds\/(?!new(?:$|\/|\.segments\/))([^/]+))?)?/,
];
const POSITIVE_ID = /^[1-9]\d*$/;

// 미들웨어의 인증(힌트)·관리자 역할 판정을 통과한 요청만 여기 온다 — /admin 비관리자는 형식과 무관하게 403 을 먼저 받는다.
// /manage 의 동아리별 권한은 클라이언트 ManageGuard 가 보므로 형식이 틀린 주소는 그보다 먼저 404 다(동아리 id 는 공개 값).
function passOrNotFound(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  // 접두사가 서로 겹치지 않아 맞는 패턴은 많아야 하나다. 선택 그룹이 안 맞으면 그 자리는 undefined 로 온다 — TS 는
  // exec 결과를 string[] 로 보지만 런타임엔 undefined 가 섞이므로 타입으로 못 박는다(가드를 지우면 목록 주소가 404).
  const idSegments: (string | undefined)[] = ID_ROUTE_PATTERNS.flatMap(
    (pattern) => pattern.exec(pathname)?.slice(1) ?? [],
  );
  const hasMalformedId = idSegments.some(
    (id) => id !== undefined && (!POSITIVE_ID.test(id) || !Number.isSafeInteger(Number(id))),
  );
  if (hasMalformedId) {
    const notFoundUrl = request.nextUrl.clone();
    notFoundUrl.pathname = '/_not-found';
    notFoundUrl.search = '';
    return NextResponse.rewrite(notFoundUrl);
  }
  return NextResponse.next();
}

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
    return passOrNotFound(request);
  }

  if (pathname.startsWith(MANAGE_PREFIX)) {
    if (!hasValidAuthHint) {
      const next = request.nextUrl.clone();
      next.pathname = '/login';
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    return passOrNotFound(request);
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
    return passOrNotFound(request);
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
