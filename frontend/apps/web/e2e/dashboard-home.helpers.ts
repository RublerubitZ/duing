import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 운영진 홈·총동연 홈 E2E 스모크 공용 — manage-home.smoke.spec.ts·admin-home.smoke.spec.ts 가 같이 쓴다.
 * dev FE·로컬 BE·개발 DB 에 붙어 읽기만 한다. 응답은 unknown 으로 받아 아래 리더로 좁힌다(as 단언 금지).
 */

export const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://localhost:8080/api/v1';
/** dev 서버는 처음 여는 경로를 그때 컴파일한다 — 첫 화면·도착 단언은 이 값으로 기다린다. */
export const ROUTE_TIMEOUT_MS = 30_000;

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// 로그인·토큰 갱신만 통과시킨다. 로그아웃은 세션을 지우는 쓰기라 넣지 않는다.
const ALLOWED_WRITE_PATHS = new Set(['/api/v1/auth/web/login', '/api/v1/auth/web/refresh']);
// 열람만으로 감사 행을 쓰는 GET — 백엔드 CookieCsrfOriginFilter.AUDITED_READ_PATHS 와 같은 목록이다(그쪽이 바뀌면 함께 고친다).
// 경로 변수는 숫자만 받는다 — admin/fees/dashboard·submission/candidates 는 감사 대상이 아니다.
const AUDITED_READ_PATTERNS: readonly RegExp[] = [
  /^\/api\/v1\/clubs\/\d+\/members\/export$/,
  /^\/api\/v1\/clubs\/\d+\/members\/\d+\/phone$/,
  /^\/api\/v1\/leader\/applications\/\d+\/phone$/,
  /^\/api\/v1\/clubs\/\d+\/join-requests\/\d+\/phone$/,
  /^\/api\/v1\/admin\/users\/\d+\/phone$/,
  /^\/api\/v1\/admin\/facility-bookings\/submission\/\d+(\/csv)?$/,
  /^\/api\/v1\/admin\/applications\/\d+$/,
  /^\/api\/v1\/admin\/fees\/\d+$/,
];

/**
 * 쓰기 요청과 열람 감사 GET 을 서버에 닿기 전에 끊고 "메서드 경로"를 쌓는다 — afterEach 에서 빈 배열인지 본다.
 * 다른 route 보다 먼저 건다. Playwright 는 나중에 건 route 를 먼저 태우므로 테스트가 따로 건 가로채기가 우선한다.
 */
export async function installReadOnlyGuard(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/v1/'),
    async (route) => {
      const method = route.request().method();
      const { pathname } = new URL(route.request().url());
      const isAuditedRead = AUDITED_READ_PATTERNS.some((pattern) => pattern.test(pathname));
      if ((READ_METHODS.has(method) && !isAuditedRead) || ALLOWED_WRITE_PATHS.has(pathname)) {
        await route.fallback();
        return;
      }
      violations.push(`${method} ${pathname}`);
      await route.abort('blockedbyclient');
    },
  );
  return violations;
}

/** 페이지 예외와 하이드레이션 경고를 쌓는다 — 매 goto 가 SSR·하이드레이션을 거치므로 새로고침 전용 테스트를 따로 두지 않는다. */
export function collectPageErrors(page: Page): string[] {
  const pageErrors: string[] = [];
  page.on('pageerror', (pageError) => pageErrors.push(`pageerror: ${pageError.message}`));
  page.on('console', (consoleMessage) => {
    if (consoleMessage.type() === 'error' && /hydrat/i.test(consoleMessage.text())) {
      pageErrors.push(`console: ${consoleMessage.text()}`);
    }
  });
  return pageErrors;
}

/**
 * next 로 바로 착지한다 — 기본 착지(/me)의 상관없는 조회가 가드에 걸리지 않게.
 * 단언(expect(page).not.toHaveURL)이 아니라 waitForURL 로 기다린다 — 페이지 단언이 실패하면 학번·비밀번호가 채워진
 * 입력칸까지 찍은 화면 스냅숏이 error-context.md 에 남는다. 'commit' 이라 load(이미지)를 기다리다 멈추지 않는다.
 */
export async function login(page: Page, studentId: string, password: string, next: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('학번', { exact: true }).fill(studentId);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { waitUntil: 'commit', timeout: ROUTE_TIMEOUT_MS });
}

/**
 * 비교 기준값을 실서버에서 읽는다 — 컨텍스트 쿠키를 공유하고 page.route 를 타지 않는다.
 * Origin 이 없으면 쿠키 인증 GET admin/fees/dashboard 가 403 이다(CookieCsrfOriginFilter 의 {clubId} 패턴).
 */
export async function apiData(page: Page, path: string): Promise<unknown> {
  const response = await page.request.get(`${API_BASE_URL}/${path}`, {
    headers: { origin: new URL(page.url()).origin },
  });
  expect(response.status(), `GET ${path} 응답 코드`).toBe(200);
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null) throw new Error(`GET ${path} 응답이 객체가 아니다: ${JSON.stringify(body)}`);
  expect(Reflect.get(body, 'ok'), `GET ${path} 의 ok`).toBe(true);
  return Reflect.get(body, 'data');
}

export function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) throw new Error(`객체가 아니라 ${key} 를 읽지 못했다: ${JSON.stringify(value)}`);
  return Reflect.get(value, key);
}

export function num(value: unknown): number {
  if (typeof value !== 'number') throw new Error(`숫자가 아니다: ${JSON.stringify(value)}`);
  return value;
}

export function str(value: unknown): string {
  if (typeof value !== 'string') throw new Error(`문자열이 아니다: ${JSON.stringify(value)}`);
  return value;
}

export function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error(`배열이 아니다: ${JSON.stringify(value)}`);
  return value;
}

/**
 * 조회 하나를 서버에 보내지 않고 500 으로 끝낸다. 교차 출처 허용 헤더는 route.fulfill 이 스스로 붙인다.
 * RQ 가 5xx 를 한 번 더 받으므로 오류 화면은 약 1초 뒤에 뜬다. route 는 테스트가 끝날 때까지 둔다.
 */
export async function failApi(page: Page, path: string): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/v1/${path}`,
    (route) => route.fulfill({ status: 500, json: { ok: false, data: null, message: 'e2e' } }),
  );
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `본문이 가로로 넘치면 안 된다(보이는 폭 ${clientWidth}px)`).toBeLessThanOrEqual(clientWidth);
}

/** 대시보드 카드 — 이름 있는 landmark 가 아니라 h2 제목으로 찾는다. */
export function card(page: Page, title: string): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) });
}

export function pageHeading(page: Page, name: string): Locator {
  return page.getByRole('heading', { level: 1, name, exact: true });
}

/** h1 바로 아래 머리말 줄(운영진 DashboardHeadline·총동연 AdminHomeHeadline). */
export function headline(page: Page): Locator {
  return page.locator('h1 + p');
}

/** 카드 로딩 표시(LoadingGate) — 150ms 뒤에야 보이지만 DOM 에는 바로 있어 개수로 기다릴 수 있다. */
export function loadingStatus(page: Page): Locator {
  return page.getByRole('status', { name: '불러오는 중', exact: true });
}

/** 오늘(KST) "M월 D일 요일" — 앱 함수로 기대값을 만들면 같은 함수끼리 비교해 아무것도 확인하지 않는다. */
export function todayLabel(): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(
    new Date(),
  );
}

export const won = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`;

/** 실서버 API 요청만 쌓는다 — 앱 서버로 가는 RSC 요청은 화면 주소의 쿼리를 그대로 달고 가서 세지 않는다. */
export function recordApiRequests(page: Page): URL[] {
  const apiRequests: URL[] = [];
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.pathname.startsWith('/api/v1/')) apiRequests.push(requestUrl);
  });
  return apiRequests;
}

export async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('요소가 화면에 그려지지 않았다');
  return box;
}

/** 첫 요소와 y 가 같은(±1px) 요소 수 = 첫 줄 칸 수. */
export function firstRowCount(boxes: ReadonlyArray<{ y: number }>): number {
  const firstY = boxes[0]?.y;
  if (firstY === undefined) return 0;
  return boxes.filter((box) => Math.abs(box.y - firstY) <= 1).length;
}
