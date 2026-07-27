import { defineConfig, devices } from '@playwright/test';

/**
 * 관리자 콘솔 스모크용 Playwright 설정.
 *
 * <p>이미 떠 있는 로컬 개발 서버(:3000)와 백엔드에 붙는다 — webServer 로 직접 띄우지 않는 이유는
 * 이 스모크가 "프론트 혼자"가 아니라 실제 백엔드·DB 와 붙은 상태를 보는 것이 목적이기 때문이다.
 * 서버가 없으면 첫 이동에서 바로 실패하므로 조용히 통과하는 일은 없다.
 *
 * <p>계정은 환경변수로만 받는다. 이 레포는 공개 저장소라 학번·비밀번호를 파일에 적지 않는다
 * (루트 CLAUDE.md: 시크릿 하드코딩 금지). 미설정이면 스펙이 통째로 스킵된다.
 */
export default defineConfig({
  testDir: './e2e',
  // 같은 관리자 계정으로 로그인하는 스펙들이라 병렬로 돌리면 세션·조치가 서로를 밟는다.
  workers: 1,
  fullyParallel: false,
  // 로컬 확인용이다 — 실패를 재시도로 덮으면 불안정한 화면을 통과로 착각한다.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  // 태블릿 폭은 해당 스펙이 test.use 로 직접 지정한다 — 프로젝트를 나누면 모든 스펙이 두 번 돈다.
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
