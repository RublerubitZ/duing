import { defineConfig, devices } from '@playwright/test';

/**
 * PR-3 인증 초기 상태 E2E 설정.
 *
 * <p>관리자 스모크(playwright.config.ts)와 달리 실백엔드에 붙지 않는다 — 프로덕션 빌드를
 * 전용 포트로 띄우고, 브라우저가 내는 API 호출은 전부 스펙의 context.route 가 대신 답한다.
 * 그래서 백엔드·DB 없이도 SSR→하이드레이션 구간의 프레임 단위 관찰이 재현된다.
 *
 * <p>실행(apps/web 에서):
 * <pre>
 *   (frontend/) NEXT_PUBLIC_API_BASE_URL=https://api.duings.com/api/v1 pnpm build
 *   (apps/web/) npx playwright test -c playwright.auth-initial.config.ts
 * </pre>
 *
 * <p>webServer 는 apps/web/.env.local 을 그대로 읽는다 — 미들웨어의 auth_hint 검증에
 * AUTH_HINT_SECRET 이 필요하고, 스펙도 같은 파일에서 그 값을 읽어 쿠키를 서명한다
 * (홈 ISR 전환 #925 이후 (home) 레이아웃은 쿠키를 읽지 않는다).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'auth-initial-state.spec.ts',
  // 같은 포트의 단일 서버를 공유하고, 프레임 관측이 CPU 경합에 민감하다.
  workers: 1,
  fullyParallel: false,
  // 재시도로 덮으면 첫 프레임 결함(이 스펙의 관심사 전부)이 통과로 둔갑한다.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3106',
    trace: 'retain-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  webServer: {
    command: 'node_modules/.bin/next start -p 3106',
    url: 'http://localhost:3106',
    // 이미 떠 있는 서버를 재사용하면 어떤 빌드인지 알 수 없다 — 항상 이 설정이 띄운 것만 쓴다.
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
