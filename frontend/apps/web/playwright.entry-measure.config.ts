import { defineConfig, devices } from '@playwright/test';

/**
 * 동아리 상세 진입 측정(스펙 P1 §2·§5) — 컨트롤러 전용. 서버는 이 설정이 띄우지 않는다: 운영 API 로 각각 프로덕션 빌드한 비교
 * 기준(develop)과 P1 을 컨트롤러가 next start 로 띄우고 주소를 환경변수로 넘긴다(club-entry-measure.spec.ts 머리말).
 * 기기별 프로젝트 하나씩 — 데스크탑 크로미엄 1280(마우스)·웹킷 iPhone 13(터치). 태블릿은 측정 밖이다(스펙 §3.4).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'club-entry-measure.spec.ts',
  workers: 1,
  fullyParallel: false,
  // 재시도로 덮으면 느린 회차가 빠져 분포가 좋아 보인다.
  retries: 0,
  timeout: 60 * 60_000,
  reporter: [['list']],
  use: { locale: 'ko-KR', timezoneId: 'Asia/Seoul', trace: 'off' },
  projects: [
    { name: 'desktop-mouse', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone-touch', use: { ...devices['iPhone 13'] } },
  ],
});
