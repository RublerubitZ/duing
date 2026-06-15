import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
  async headers() {
    // 앱 깨짐 위험이 없는 안전 보안 헤더만 우선 적용한다. script/style/img/connect-src 까지 강제하는
    // 전체 CSP 는 Next 15/React 19 인라인 자산·런타임 이미지 호스트 검증이 필요해 별도 후속으로 둔다.
    return [
      {
        source: '/:path*',
        headers: [
          // HTTPS 강제 (http://localhost 에는 브라우저가 무시하므로 로컬 개발에 영향 없음).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // 클릭재킹 차단 — 레거시 X-Frame-Options 와 최신 CSP frame-ancestors 를 함께 둔다.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // MIME 스니핑 차단(폴리글랏 업로드 대비), 외부로의 Referer 경로 노출 최소화.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

// Sentry 빌드 통합. 소스맵 업로드는 SENTRY_AUTH_TOKEN·org·project 가 설정됐을 때만 동작하고,
// 미설정(MVP)이면 스킵된다 — 런타임 에러 캡처는 DSN 만으로 동작한다.
export default withSentryConfig(nextConfig, {
  silent: true,
});
