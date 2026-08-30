import { withSentryConfig } from '@sentry/nextjs';

// 강제(enforce) CSP 는 frame-ancestors 'none'(클릭재킹) 만 유지하고, script/style/img/connect 까지 포함한
// "후보 전체 정책" 은 운영(prod)에서만 Report-Only 로 내보낸다(headers() 참고) — 차단하지 않고 위반만
// 보고하므로 무중단으로 실제 위반 출처를 실측하고, 검증 뒤 nonce 미들웨어로 script-src 를 좁혀 enforce 로
// 승격한다(후속). dev 에서 빼는 이유는 localhost 이미지·API·HMR eval 위반이 폭주해 관찰 신호가 묻히기 때문.
//  - script/style 의 'unsafe-inline' 은 Next 15/React 19 하이드레이션 인라인 자산의 임시 허용이다.
//  - img-src 의 https://files.duings.com 은 R2 공개 이미지 호스트, connect-src 의 api.duings.com 은 백엔드 API.
//  - Sentry 인제스트 와일드카드는 DSN 연동 시 실제 호스트(oXXX.ingest.<region>.sentry.io)로 정확히 교체한다.
//  - 운영 Sentry 미연동 상태라 report-uri 는 아직 두지 않는다(운영 빌드 콘솔로 관찰, 연동 후 수집처 추가).
const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://files.duings.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.duings.com https://*.sentry.io https://*.ingest.sentry.io",
  "worker-src 'self' blob:",
].join('; ');

// AUTH_HINT_SECRET 미주입 fail-fast. 이 값이 없으면 미들웨어가 보호 경로(/apply·/me·/manage·/admin)
// 요청마다 throw 해서 500 을 낸다(apps/web/middleware.ts). 런타임 throw 는 이미 있지만 그건 "사용자가
// 먼저 맞는다"는 뜻이라, 그런 빌드가 배포되지 못하게 여기서 먼저 깬다.
//
// 한계를 분명히 해둔다: 미들웨어는 이 값을 번들에 인라인하지 않고 런타임에 읽으므로(빌드 산출물에서
// `process.env.AUTH_HINT_SECRET` 그대로 확인), 이 검사는 빌드 환경으로 런타임 환경을 추정하는 대리
// 검사다. 같은 Vercel 프로젝트 환경변수 집합을 쓰기에 "아예 등록을 안 한" 실수는 잡지만, 빌드에만
// 노출하고 런타임에서 뺀 경우는 못 잡는다. 그쪽은 uptime 모니터 5번(deploy/UPTIME.md)이 맡는다.
//
// 조건을 NODE_ENV 가 아니라 VERCEL_ENV 로 잡은 이유(되돌리지 말 것): next.config 는 `next build` 뿐
// 아니라 `next lint`·`next start` 도 로드하고, 그때 NODE_ENV 는 전부 'production' 이다. NODE_ENV 로
// 걸면 CI 의 Lint 스텝(AUTH_HINT_SECRET 미주입)이 깨져 Gate 가 영구 red 가 되고, Preview 환경에 이
// 변수를 등록하지 않았다면 프리뷰 배포까지 전부 깨진다. VERCEL_ENV 는 Vercel 빌드에서만 정의되므로
// 실제로 막고 싶은 지점 — 운영 배포 빌드 — 에만 걸린다. 실패하면 직전 배포가 그대로 유지된다.
if (process.env.VERCEL_ENV === 'production' && !process.env.AUTH_HINT_SECRET) {
  throw new Error(
    'AUTH_HINT_SECRET 이 없습니다. 운영 배포 빌드에 필수입니다 — Vercel 프로젝트 환경변수(Production)에 ' +
      '등록됐는지 확인하세요. 없으면 /apply·/me·/manage·/admin 이 전부 500 이 됩니다.',
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  // 모노레포 워크스페이스 패키지를 Next 가 트랜스파일하도록 설정
  transpilePackages: [
    '@duing/api',
    '@duing/hooks',
    '@duing/schemas',
    '@duing/storage',
    '@duing/stores',
    '@duing/types',
  ],
  typedRoutes: true,
  experimental: {
    // 클라이언트 라우터 캐시 — 동적 세그먼트(로그인·콘솔 등)도 3분간 재사용한다.
    // 기본값 0 이면 하단 탭 재방문마다 풀 RSC 재페치가 돌아 로딩 폴백이 번쩍인다(모바일 깜빡임).
    // 홈은 ISR(#925) 전환으로 static 분류(기본 staleTimes.static 5분)를 받는다.
    staleTimes: { dynamic: 180 },
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/array/:path*',
        destination: 'https://us-assets.i.posthog.com/array/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  images: {
    // /_next/image 최적화 결과의 Cache-Control 하한. 기본 60초라 최적화 이미지가 브라우저·CDN 에 남지 않아
    // 새로고침마다 재검증 왕복이 생기고(실측 x-vercel-cache MISS), 매번 최적화기를 탄다.
    // 이 앱의 next/image 원본은 public/ 정적 자산뿐(업로드 이미지는 raw <img>)이라 아래 immutable 규칙과 같은 1년.
    minimumCacheTTL: 31536000,
  },
  async headers() {
    const headers = [
      // HTTPS 강제 (http://localhost 에는 브라우저가 무시하므로 로컬 개발에 영향 없음).
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      // 클릭재킹 차단 — 레거시 X-Frame-Options 와 최신 CSP frame-ancestors 를 함께 둔다.
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      // MIME 스니핑 차단(폴리글랏 업로드 대비), 외부로의 Referer 경로 노출 최소화.
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];
    // 전체 CSP 후보는 운영에서만 Report-Only 로 관찰한다 — dev 의 localhost·HMR 위반 잡음 제외(상단 주석 참고).
    if (process.env.NODE_ENV === 'production') {
      headers.push({
        key: 'Content-Security-Policy-Report-Only',
        value: CONTENT_SECURITY_POLICY_REPORT_ONLY,
      });
    }
    return [
      { source: '/:path*', headers },
      // 정적 폰트 장기 캐시. Vercel 은 public/ 자산을 max-age=0, must-revalidate 로 서빙해
      // 재방문 문서 로드마다 폰트 4~5건(합 ~3.9MB)의 조건부 재검증 왕복이 발생한다 — immutable 로 제거한다.
      // ⚠ immutable 규약: 폰트 파일을 교체할 때는 반드시 파일명을 바꾼다(같은 이름으로 덮어쓰면
      // 기존 방문자에게 최대 1년간 구 폰트가 보인다). globals.css 의 @font-face url 도 함께 갱신할 것.
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // 정적 이미지·favicon 도 같은 이유로 장기 캐시. Vercel 기본(max-age=0)이면 새로고침마다 이미지 10여 건이
      // 조건부 재검증 왕복을 하고 favicon(27KB)은 통째로 다시 받는다 — 실측 기준.
      // 확장자 앞의 `.` 은 필수다: Next 문서의 `/:all*(svg|jpg|png)` 그대로 쓰면 마지막 세그먼트가 그 글자로
      // "끝나기만 하면" 걸려, 초대 코드(`/join/ABCPNG` 같은 Crockford 6자)의 HTML 까지 1년 캐시된다.
      // 같은 immutable 규약: 이미지를 교체할 때는 파일명을 바꾼다(og-image.png 포함).
      {
        source: '/:all*.(png|jpg|jpeg|webp|avif|gif|svg|ico)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

// Sentry 빌드 통합. org·project 슬러그는 시크릿이 아니라 코드에 둔다(공식 권장). 시크릿인 authToken 만
// 빌드 env(Vercel)로 주입하며, 토큰이 있을 때만 소스맵을 업로드해 스택트레이스를 원본 TS 로 보이게 한다.
// 토큰 미설정(로컬·미설정 환경)이면 업로드는 자동 스킵되고, 런타임 에러 캡처는 DSN 만으로 동작한다.
export default withSentryConfig(nextConfig, {
  org: 'duing',
  project: 'next-duing',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  webpack: {
    // 미들웨어 자동 래핑 해제. 켜두면 Sentry 가 middleware.ts 를 wrapMiddlewareWithSentry 로 감싸면서
    // @sentry/core 를 미들웨어 번들에 끌어들이고, 매 요청 isolation scope 복제·요청 헤더 직렬화·span
    // 생성·flush 예약을 돌린다. 미들웨어가 하는 일은 auth_hint 검증 한 번뿐이라 관측 이득 대비
    // Active CPU 비용이 크다. 서버·클라이언트 계측과 소스맵 업로드는 그대로 유지된다.
    // webpack 빌드(`next build`) 전용 옵션이다 — 빌드를 turbopack 으로 옮기면 이 줄은 무효가 된다.
    // (다만 Sentry 는 turbopack 에서 애초에 미들웨어를 감싸지 못하므로 그때도 래핑은 없다.)
    autoInstrumentMiddleware: false,
  },
});
