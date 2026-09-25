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
  // AdSense 로더(layout.tsx head). 이 정책은 Report-Only 라 빼도 광고는 동작하지만,
  // 관찰 채널이 애드센스 위반으로 상시 오염되면 "실제 위반 출처 실측"이라는 존재 이유가 죽는다.
  // 광고가 실제 게재되기 시작하면 후속 리소스 호스트(adtrafficquality 등)가 위반으로 찍힐 것 —
  // 그때 관찰된 실측 호스트만 추가한다(선제 나열 금지).
  "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com",
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
// 아니라 `next start` 도 로드하고(NODE_ENV='production'), Vercel 의 Preview 배포 빌드도 NODE_ENV 가
// 'production' 이다. 그런데 Vercel 프로젝트는 AUTH_HINT_SECRET 을 Production 환경에만 등록해 두었으므로,
// NODE_ENV 로 걸면 이 변수 없이 돌리는 로컬 `next start` 와 모든 Preview 빌드가 깨진다. VERCEL_ENV 는
// Vercel 빌드에서만 정의되므로 실제로 막고 싶은 지점 — 운영 배포 빌드 — 에만 걸린다. 실패하면 직전
// 배포가 그대로 유지된다.
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
  // Next 16 은 AI 코딩 에이전트 환경(Claude Code·Cursor 등)에서 `next dev` 가 이 디렉터리에 AGENTS.md·CLAUDE.md 를
  // 자동 생성한다. 에이전트 지침은 frontend/AGENTS.md·frontend/CLAUDE.md 로 직접 관리하므로 끈다 — 켜 두면
  // apps/web/CLAUDE.md 가 중첩 지침으로 로드되고 untracked 파일 2개가 매번 생긴다.
  agentRules: false,
  compiler: {
    // Sentry 번들 축소 플래그. 예전엔 withSentryConfig 의 bundleSizeOptimizations 로 줬는데 그 옵션은
    // Sentry 의 webpack DefinePlugin 으로만 구현돼 있어 Turbopack 빌드(Next 16 기본)에서는 조용히 무효가
    // 된다 — 실측으로 클라이언트 번들에 browserTracingIntegration 이 되살아났다. Next 의 define 은 Turbopack·
    // webpack 양쪽에 적용되므로 같은 매직 플래그를 여기서 직접 치환한다. `define` 은 client·server·edge 세 빌드
    // 모두에 들어간다(next/dist/build/define-env.js) — 같은 키를 `defineServer` 에 또 쓰면 빌드가 E689 로 깨진다.
    //
    // ⚠ 커플링 1 — __SENTRY_TRACING__=false 는 instrumentation-client.ts 의 `tracesSampleRate: 0`(성능 추적
    // 비활성)과 한 쌍이다. 추적을 다시 켤 때(tracesSampleRate > 0) 이 플래그를 반드시 함께 지운다. 안 지우면
    // 샘플링만 올라가고 span 코드는 번들에서 빠진 채라 조용히 아무 것도 수집되지 않는다. 실제 절감이 나오는
    // 항목도 이것뿐이다(SDK 는 tracesSampleRate 가 0 이어도 browserTracingIntegration 을 기본 통합에 넣는다).
    // instrumentation-client.ts 의 onRouterTransitionStart export 는 그대로 둬도 안전하다 — 내부 핸들러를
    // 채우는 appRouterInstrumentNavigation 이 이 가드 안이라 no-op 으로 남는다.
    //
    // ⚠ 커플링 2 — __RRWEB_* / __SENTRY_EXCLUDE_REPLAY_WORKER__ 3종은 세션 리플레이 도입 금지 정책과 한 쌍이다
    // (사유는 instrumentation-client.ts 의 `tracesSampleRate` 위 주석 — 학생 PII 화면 캡처). replayIntegration 을
    // 쓰지 않으므로 절감은 ~0 이고, 누군가 리플레이를 붙이면 곧바로 무동작으로 드러나게 하는 정책 방어용이다.
    //
    // __SENTRY_DEBUG__=false — client·server init 어느 쪽도 Sentry `debug` 를 켜지 않으므로 잃는 정보가 없다.
    define: {
      __SENTRY_TRACING__: false,
      __SENTRY_DEBUG__: false,
      __RRWEB_EXCLUDE_IFRAME__: true,
      __RRWEB_EXCLUDE_SHADOW_DOM__: true,
      __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
    },
  },
  experimental: {
    // 클라이언트 라우터 캐시 — 동적 세그먼트(로그인·콘솔 등)도 3분간 재사용한다.
    // 기본값 0 이면 하단 탭 재방문마다 풀 RSC 재페치가 돌아 로딩 폴백이 번쩍인다(모바일 깜빡임).
    // 홈은 ISR(#925) 전환으로 static 분류(기본 staleTimes.static 5분)를 받는다.
    staleTimes: { dynamic: 180 },
  },
  // 리다이렉트만 하는 페이지는 루트 loading 경계가 셸을 먼저 스트리밍해 200 + 클라이언트 이동으로 늦게 나가므로,
  // 페이지의 redirect() 대신 여기서 HTTP 리다이렉트로 처리한다.
  // 레거시 시설 상세 주소(/facilities/{id}, #639 이전)를 쿼리 방식으로 영구 이동한다. 예전엔 페이지 안의
  // redirect() 였는데, 루트 loading 경계가 셸을 먼저 스트리밍해 200 + meta refresh(1초)로 나갔다 — 검색엔진이
  // 영구 이동으로 보지 않고 매번 셸을 렌더했다. 예전 페이지처럼 한 세그먼트 값은 모두 목록으로 넘기고 숫자 판정은 목록 페이지가 한다.
  // 이 규칙은 파일 라우트보다 먼저 돌아 /facilities/ 아래에 정적 라우트를 새로 만들면 가로챈다 — 그때 source 를 좁힐 것.
  // 영구(308) 이동은 브라우저가 캐시하므로, 상세 페이지를 되살리면 이 규칙을 지우는 것만으로는 재방문자에게 반영되지 않는다.
  async redirects() {
    return [
      {
        source: '/facilities/:facilityId',
        destination: '/facilities?facilityId=:facilityId',
        permanent: true,
      },
      // 관리자 옛 경로 — 탭으로 흡수된 URL 의 북마크 호환. 관리자 전용이라 검색 노출 이득이 없고 경로를 다시
      // 쓸 수 있게 임시(307)로 둔다(308 은 브라우저가 캐시해 되돌리기 어렵다). /submission/{batchId} 같은 하위
      // 경로는 source 가 정확히 일치할 때만 걸리므로 영향이 없다.
      {
        source: '/admin/facility-crawl',
        destination: '/admin/facility-bookings?tab=crawl',
        permanent: false,
      },
      {
        source: '/admin/facility-bookings/submission',
        destination: '/admin/facility-bookings?tab=prepare',
        permanent: false,
      },
      // 멤버 영역 루트는 공지 탭으로 보낸다. 멤버 홈이 생길 수 있어 임시(307).
      {
        source: '/clubs/:clubId/member',
        destination: '/clubs/:clubId/member/notices',
        permanent: false,
      },
    ];
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
    // next/image 원본은 public/ 정적 자산과 아래 remotePatterns 의 업로드 이미지(LCP 요소 2곳 — 홈 배너·
    // 클럽 상세 커버)뿐이다. 나머지 업로드 이미지는 여전히 raw <img> 라 이 목록에 없어도 된다.
    // 업로드 키가 UUID 라 덮어쓰기가 없어(교체 = 새 URL) 원격 원본에도 1년 하한이 안전하다 —
    // 아래 immutable 규칙과 같은 값.
    minimumCacheTTL: 31536000,
    // 변환 품질을 실사용 값 하나로 잠근다. remotePatterns 를 연 순간 /_next/image 는 무인증
    // 공개 엔드포인트가 되는데, Next 15 는 qualities 미설정 시 q=1~100 을 전부 받아 제3자가
    // (원본 × 폭 × 품질) 조합 열거로 유료 변환을 증폭시킬 수 있다(적대적 리뷰 실측 — 이론상
    // 2만+ 고유 변환). 렌더 경로는 기본 q=75 만 쓰므로 잠가도 무손실이고, Next 16 기본값([75])
    // 을 선취하는 것이기도 하다.
    qualities: [75],
    remotePatterns: [
      // 운영 R2 공개 호스트(S3_PUBLIC_BASE_URL). CSP img-src 와 같은 호스트다.
      { protocol: 'https', hostname: 'files.duings.com' },
      // 로컬 개발 전용. dev 백엔드는 R2 개발 버킷의 기본 공개 호스트(pub-<id>.r2.dev)를 쓰고,
      // 시드 데이터에도 서로 다른 버킷 호스트가 섞여 있어 와일드카드로 연다. 운영 빌드에서는 빼는데,
      // 남겨두면 남의 r2.dev 버킷 이미지까지 우리 최적화기가 중계(오픈 이미지 프록시)하게 된다.
      ...(process.env.NODE_ENV === 'production'
        ? []
        : [{ protocol: 'https', hostname: '**.r2.dev' }]),
    ],
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
  // 미들웨어 Sentry 자동 래핑은 끈 상태를 유지한다 — Turbopack 빌드(Next 16 기본)는 미들웨어를 감싸지
  // 않으므로 별도 옵션이 필요 없다(webpack 전용이던 `webpack.autoInstrumentMiddleware: false` 는 제거).
  // 이 전제는 @sentry/nextjs 10.x 빌드 산출(edge 청크에 wrapMiddlewareWithSentry 0건)로 확인한 것이라,
  // Sentry 메이저를 올릴 때 같은 방법으로 다시 확인한다.
});
