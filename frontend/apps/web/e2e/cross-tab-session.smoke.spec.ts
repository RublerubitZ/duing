import { expect, test, type BrowserContext, type Page, type Response } from '@playwright/test';

import { ROUTE_TIMEOUT_MS, apiData, field, installReadOnlyGuard, num, recordApiRequests } from './dashboard-home.helpers';

/**
 * 탭 사이 계정 전환 스모크 — 같은 브라우저(컨텍스트)의 두 탭에서 한 탭이 로그인·로그아웃하면, 남은 탭이 하드 새로고침해
 * 바뀐 계정으로 다시 확인하는지 실제 storage 이벤트·실제 HttpOnly 쿠키로 본다(단위 테스트는 jsdom 의 가짜 이벤트로 판단만 본다).
 *
 * <p>왜 이 설정인가: playwright.config.ts 는 dev :3000 + 로컬 백엔드·개발 DB 에 붙어 쿠키가 실제로 바뀐다.
 * playwright.auth-initial.config.ts 는 API 를 전부 흉내 내는 첫 프레임 관찰용이고 testMatch 가 파일 하나로 묶여 있어 쓰지 않는다.
 *
 * <p>실행(apps/web): PLAYWRIGHT_NO_COPY_PROMPT=1 E2E_MEMBER_STUDENT_ID=… E2E_MEMBER_PASSWORD=… E2E_LEADER_STUDENT_ID=… E2E_LEADER_PASSWORD=… \
 *   pnpm exec playwright test -c playwright.config.ts e2e/cross-tab-session.smoke.spec.ts
 * dev 서버가 붙는 API 주소가 :8080 이 아니면 E2E_API_BASE_URL(예: http://localhost:8091/api/v1)·E2E_BASE_URL 을 함께 준다.
 * 계정은 환경변수로만 받는다 — 회원 E2E_MEMBER_*, 회장 E2E_LEADER_*(서로 다른 학번). 하나라도 없으면 통째로 건너뛴다.
 * 배선 테스트는 쓰기 전 정착을 networkidle 로 기다린다 — PostHog 키가 있는 dev 환경에선 수집 요청이 이어져 그 대기가 30초 뒤 실패할 수 있다.
 *
 * <p>실패 기록(test-results/ 의 error-context.md)에 남는 것과 뒤처리는 dashboard-home.helpers.ts 머리말을 본다.
 *
 * <p>서버에 닿는 쓰기는 로그인·토큰 갱신과 첫 테스트의 로그아웃(이 테스트가 만든 회장 세션)뿐이다 — 그 밖의 쓰기와 열람 감사 GET 은
 * installReadOnlyGuard 가 끊고 테스트를 실패시킨다. 회원 세션은 실행마다 넷씩, 회장 세션은 하나씩(로그인 예외 테스트) 서버에 남는다 —
 * 동시 세션 상한이 기본값(5)인 백엔드에서 여러 번 돌리면 같은 계정의 오래된 세션이 밀려난다.
 */

const MEMBER_STUDENT_ID = process.env.E2E_MEMBER_STUDENT_ID;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;
const LEADER_STUDENT_ID = process.env.E2E_LEADER_STUDENT_ID;
const LEADER_PASSWORD = process.env.E2E_LEADER_PASSWORD;
const ME_PATH = '/api/v1/users/me';
const REFRESH_PATH = '/api/v1/auth/web/refresh';
const LOGOUT_PATH = '/api/v1/auth/web/logout';
const LOGIN_PATH = '/api/v1/auth/web/login';
const MY_INQUIRIES_PATH = '/api/v1/me/federation-inquiries';
// 요청 시점 막기 배선에 쓰는 화면 — 작성 화면은 목록 조회를 하지 않아, '내 문의' 링크로 옮기면 캐시에 없는 목록 조회가 나간다.
const INQUIRY_FORM_PATH = '/me/inquiries/new';
// 다른 탭이 다른 계정으로 로그인해 쓴 척하는 공유 표지 값 — 실제 사용자 id 와 겹치지 않는다.
const FOREIGN_SESSION_USER = 'e2e-other-tab-user';
// 앱의 공유 사용자 표지(app/_lib/authBoot.ts SESSION_USER_KEY)와 같은 키.
const SESSION_USER_KEY = 'duing:auth:session-user';
// 새로고침 판별 표지 — 앱의 data-had-session 과 겹치지 않는 이름.
const RELOAD_MARKER = 'data-e2e-cross-tab-marker';

// trace 에는 로그인 요청 본문이 평문으로 남고, 실패 스크린샷에는 실명·학번이 든 화면이 남는다.
test.use({ trace: 'off', screenshot: 'off' });
// 차가운 dev 서버는 처음 여는 경로를 그때 컴파일해 로그인 두 번·새로고침 두 번이 기본 30초에 들어가지 않는다.
test.describe.configure({ timeout: 120_000 });
test.skip(
  !MEMBER_STUDENT_ID || !MEMBER_PASSWORD || !LEADER_STUDENT_ID || !LEADER_PASSWORD,
  'E2E_MEMBER_* / E2E_LEADER_* 가 없으면 건너뛴다(계정을 레포에 넣지 않는다).',
);
test.skip(MEMBER_STUDENT_ID === LEADER_STUDENT_ID, '두 계정의 학번이 같으면 사용자 바뀜을 볼 수 없다.');

const guardViolations: string[][] = [];
test.beforeEach(() => {
  guardViolations.length = 0;
});
test.afterEach(() => {
  expect(guardViolations.flat(), '실서버로 나간 쓰기 요청').toEqual([]);
});

// 모든 페이지에 읽기 전용 가드를 건다 — 컨텍스트의 새 페이지도 빠짐없이.
async function openGuardedPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  guardViolations.push(await installReadOnlyGuard(page));
  return page;
}

const isPath = (response: Response, path: string) => new URL(response.url()).pathname === path;

// helpers 의 login 과 같은 단계·같은 실패 처리. 다른 점: 로그인 화면의 부팅 확인(/users/me 200 또는 refresh 응답)을 기다린 뒤 입력한다 —
// 부팅 /users/me 가 로그인과 겹치면 옛 사용자로 확인해 공유 표지를 덮는다.
async function loginAfterBoot(page: Page, studentId: string, password: string, next: string): Promise<void> {
  const bootSettled = page.waitForResponse(
    (response) => (isPath(response, ME_PATH) && response.ok()) || isPath(response, REFRESH_PATH),
    { timeout: ROUTE_TIMEOUT_MS },
  );
  await page.goto(`/login?next=${encodeURIComponent(next)}`, { waitUntil: 'commit' });
  await bootSettled;
  await submitLogin(page, studentId, password);
}

// 열린 로그인 화면에서 입력·제출하고 로그인 화면을 벗어날 때까지 기다린다.
async function submitLogin(page: Page, studentId: string, password: string): Promise<void> {
  await page.getByLabel('학번', { exact: true }).fill(studentId);
  try {
    await page.getByLabel('비밀번호', { exact: true }).fill(password, { timeout: ROUTE_TIMEOUT_MS });
    await page.getByRole('button', { name: '로그인', exact: true }).click({ timeout: ROUTE_TIMEOUT_MS });
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { waitUntil: 'commit', timeout: ROUTE_TIMEOUT_MS });
  } catch (loginError) {
    // 빈 페이지로 못 옮겨도 원래 오류를 던진다 — 테스트 끝 스냅숏에 입력칸이 남지 않게.
    await page.goto('about:blank').catch(() => undefined);
    throw loginError;
  }
}

async function markDocument(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((attribute) => document.documentElement.setAttribute(attribute, ''), RELOAD_MARKER);
}

// 새로고침 증명 — 단 표지가 없는 문서면 새 문서다(같은 문서 안 이동으로는 표지가 사라지지 않는다).
async function expectReloaded(page: Page): Promise<void> {
  await expect(page.locator(`html[${RELOAD_MARKER}]`)).toHaveCount(0, { timeout: ROUTE_TIMEOUT_MS });
}

function waitForMeOk(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => isPath(response, ME_PATH) && response.request().method() === 'GET' && response.ok(),
    { timeout: ROUTE_TIMEOUT_MS },
  );
}

async function sharedSessionUser(page: Page): Promise<string | null> {
  await page.waitForLoadState('domcontentloaded');
  return page.evaluate((key) => window.localStorage.getItem(key), SESSION_USER_KEY);
}

async function meIdOf(response: Response): Promise<number> {
  const body: unknown = await response.json();
  return num(field(field(body, 'data'), 'id'));
}

// 같은 문서의 쓰기는 storage 이벤트를 만들지 않는다 — 다른 탭이 썼는데 이 문서가 아직 이벤트를 처리하지 않은 순간이 된다.
async function writeSharedSessionUser(page: Page, value: string | null): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(
    ({ key, nextValue }) => {
      if (nextValue === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, nextValue);
    },
    { key: SESSION_USER_KEY, nextValue: value },
  );
}

// 새 문서를 열고 그 문서의 부팅 확인이 표지를 쓸 때까지 기다린다 — 앞 문서가 남긴 같은 값으로는 확인이 끝났는지 알 수 없다.
// 앱이 없는 같은 출처 문서(public/ads.txt)로 먼저 떠나 지운다 — 앞 문서의 늦은 확인이 지운 표지를 다시 쓰지 못하게.
async function reopenConfirmed(page: Page, path: string, userId: number): Promise<void> {
  const appFreeDocument = await page.goto('/ads.txt');
  // 파일이 없으면 앱의 404 문서가 떠 그 문서의 늦은 확인이 지운 표지를 다시 쓴다 — 조용히 약해지지 않게 여기서 멈춘다.
  expect(appFreeDocument?.status(), '/ads.txt 응답 코드').toBe(200);
  await writeSharedSessionUser(page, null);
  await page.goto(path, { waitUntil: 'commit' });
  await expect.poll(() => sharedSessionUser(page), { timeout: ROUTE_TIMEOUT_MS }).toBe(String(userId));
}

// 문의 작성 화면의 '내 문의' 링크 — 클라이언트 이동이라 문서는 그대로다.
async function openInquiryList(page: Page): Promise<void> {
  await page.getByRole('main').getByRole('link', { name: '내 문의', exact: true }).click({ timeout: ROUTE_TIMEOUT_MS });
  await expect(page.getByRole('heading', { level: 1, name: '내 문의', exact: true })).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
}

test('다른 탭에서 다른 계정으로 로그인하면 이 탭이 새로고침돼 그 계정으로 다시 확인하고, 로그아웃하면 다시 새로고침된다', async ({
  context,
}) => {
  const memberTab = await openGuardedPage(context);
  const leaderTab = await openGuardedPage(context);

  // 로그인 화면의 부팅 /users/me 는 401 이라, 처음 오는 200 이 /me 문서의 부팅 확인이다 — 표지는 그 확인 뒤에 단다.
  const memberBootConfirmed = waitForMeOk(memberTab);
  await loginAfterBoot(memberTab, MEMBER_STUDENT_ID ?? '', MEMBER_PASSWORD ?? '', '/me');
  const memberId = await meIdOf(await memberBootConfirmed);
  await expect.poll(() => sharedSessionUser(memberTab), { timeout: ROUTE_TIMEOUT_MS }).toBe(String(memberId));

  await markDocument(memberTab);
  const memberTabMeAfterReload = waitForMeOk(memberTab);
  await loginAfterBoot(leaderTab, LEADER_STUDENT_ID ?? '', LEADER_PASSWORD ?? '', '/me/settings');
  // 로그인한 탭의 하드 이동이 방해받지 않는다 — 로그인 화면으로 되돌아가지 않는다.
  await expect(leaderTab).toHaveURL(/\/me\/settings$/);
  const leaderId = num(field(await apiData(leaderTab, 'users/me'), 'id'));
  expect(leaderId).not.toBe(memberId);

  await expectReloaded(memberTab);
  expect(await meIdOf(await memberTabMeAfterReload)).toBe(leaderId);

  // 가드 뒤에 건 route 가 먼저 탄다 — 이 테스트가 만든 회장 세션의 로그아웃만 서버로 보낸다.
  await leaderTab.route(
    (url) => url.pathname === LOGOUT_PATH,
    (route) => (route.request().method() === 'POST' ? route.continue() : route.fallback()),
  );
  await markDocument(memberTab);
  const logoutDialog = leaderTab.getByRole('dialog', { name: '로그아웃할까요?' });
  // 하이드레이션 전 클릭은 확인 창을 열지 못한다 — 창이 보일 때까지 다시 누른다(이미 열렸으면 누르지 않는다).
  await expect(async () => {
    if (!(await logoutDialog.isVisible())) {
      await leaderTab
        .locator('#settings-account')
        .getByRole('button', { name: '로그아웃', exact: true })
        .click({ timeout: 2_000 });
    }
    await expect(logoutDialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: ROUTE_TIMEOUT_MS });
  await logoutDialog.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expectReloaded(memberTab);
  await expect(memberTab).toHaveURL(/\/login\?next=%2Fme$/, { timeout: ROUTE_TIMEOUT_MS });
});

test('비로그인 탭은 다른 탭이 로그인하면 새로고침돼 그 계정으로 다시 확인한다', async ({ context }) => {
  const anonymousTab = await openGuardedPage(context);
  const loginTab = await openGuardedPage(context);

  // 비로그인 부팅은 /users/me 401 → 쿠키 없는 refresh 401 로 확정된다.
  const anonymousBootSettled = anonymousTab.waitForResponse((response) => isPath(response, REFRESH_PATH), {
    timeout: ROUTE_TIMEOUT_MS,
  });
  await anonymousTab.goto('/clubs', { waitUntil: 'commit' });
  await anonymousBootSettled;

  await markDocument(anonymousTab);
  const anonymousTabMeAfterReload = waitForMeOk(anonymousTab);
  await loginAfterBoot(loginTab, MEMBER_STUDENT_ID ?? '', MEMBER_PASSWORD ?? '', '/clubs');
  const memberId = num(field(await apiData(loginTab, 'users/me'), 'id'));

  await expectReloaded(anonymousTab);
  expect(await meIdOf(await anonymousTabMeAfterReload)).toBe(memberId);
});

test('다른 탭이 사용자를 바꿨는데 이 탭이 아직 이벤트를 못 받았으면 요청을 보내는 순간 막는다(앱의 연결 어댑터 배선)', async ({
  context,
}) => {
  const memberTab = await openGuardedPage(context);
  await loginAfterBoot(memberTab, MEMBER_STUDENT_ID ?? '', MEMBER_PASSWORD ?? '', INQUIRY_FORM_PATH);
  const memberId = num(field(await apiData(memberTab, 'users/me'), 'id'));

  // 대조 — 표지가 그대로면 같은 이동이 문의 목록을 서버에 묻는다(아래 0 건이 거저 나오지 않는다).
  await reopenConfirmed(memberTab, INQUIRY_FORM_PATH, memberId);
  const controlRequests = recordApiRequests(memberTab);
  await openInquiryList(memberTab);
  await expect
    .poll(() => controlRequests.map((requestUrl) => requestUrl.pathname), { timeout: ROUTE_TIMEOUT_MS })
    .toContain(MY_INQUIRIES_PATH);

  // 캐시가 빈 새 문서에서 같은 이동 — 탭을 바꾸지 않는다(다시 보임이 이벤트 경로로 새로고침한다).
  await reopenConfirmed(memberTab, INQUIRY_FORM_PATH, memberId);
  await markDocument(memberTab);
  // 이 문서의 첫 조회가 다 나간 뒤에 센다 — 쓰기 전에 나간 요청은 막을 대상이 아니다.
  await memberTab.waitForLoadState('networkidle', { timeout: ROUTE_TIMEOUT_MS });
  const blockedRequests = recordApiRequests(memberTab);
  await writeSharedSessionUser(memberTab, FOREIGN_SESSION_USER);
  await openInquiryList(memberTab);

  await expect(memberTab.getByText('문의 목록을 불러오지 못했습니다.', { exact: true })).toBeVisible({
    timeout: ROUTE_TIMEOUT_MS,
  });
  expect(blockedRequests.map((requestUrl) => requestUrl.pathname)).toEqual([]);
  await expect(memberTab.locator(`html[${RELOAD_MARKER}]`)).toHaveCount(1);
});

test('다른 탭이 사용자를 바꿨는데 이 탭이 아직 이벤트를 못 받았어도 로그인 요청은 막지 않는다', async ({ context }) => {
  const memberTab = await openGuardedPage(context);
  await loginAfterBoot(memberTab, MEMBER_STUDENT_ID ?? '', MEMBER_PASSWORD ?? '', '/me');
  const memberId = num(field(await apiData(memberTab, 'users/me'), 'id'));

  // 세션이 있어도 로그인 화면은 열린다(사용자 전환). 이 문서가 회원으로 확인을 마친 뒤 다른 탭이 쓴 것처럼 표지를 바꾼다.
  await reopenConfirmed(memberTab, `/login?next=${encodeURIComponent('/me/settings')}`, memberId);
  await writeSharedSessionUser(memberTab, FOREIGN_SESSION_USER);
  // 시간 제한이 있는 대기(waitForRequest)를 미리 걸지 않는다 — 요청이 막히면 그 대기가 submitLogin 보다 먼저 끝나
  // 테스트를 끊고, 학번·비밀번호가 채워진 화면이 실패 기록에 남는다. 막히면 submitLogin 이 빈 페이지로 옮긴 뒤 실패한다.
  const loginRequests = recordApiRequests(memberTab);
  await submitLogin(memberTab, LEADER_STUDENT_ID ?? '', LEADER_PASSWORD ?? '');

  expect(loginRequests.map((requestUrl) => requestUrl.pathname)).toContain(LOGIN_PATH);
  // 늦은 탭의 로그인이 이겼다 — 쿠키가 회장 세션이다.
  expect(num(field(await apiData(memberTab, 'users/me'), 'id'))).not.toBe(memberId);
});
