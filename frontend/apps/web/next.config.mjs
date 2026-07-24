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
    // 클라이언트 라우터 캐시 — 동적 세그먼트(홈 force-dynamic 등)도 3분간 재사용한다.
    // 기본값 0 이면 하단 탭 재방문마다 풀 RSC 재페치가 돌아 로딩 폴백이 번쩍인다(모바일 깜빡임).
    // 홈 콘텐츠(배너·모집 티커)는 3분 staleness 를 허용할 수 있는 노출성 데이터다.
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
    return [{ source: '/:path*', headers }];
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
});
