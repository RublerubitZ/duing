import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * PR-3 인증 초기 상태 — SSR→하이드레이션 프레임·플로우 E2E (metric 1·2·4).
 *
 * 백엔드는 띄우지 않는다. 브라우저가 내는 모든 API 호출을 context.route 로 가로채
 * 시나리오(정상·access 만료·익명·갱신 일시장애)를 직접 만든다. auth_hint 는 서버와 같은
 * 시크릿으로 스펙이 직접 HMAC 서명하므로 미들웨어의 실제 검증을 통과한다(홈 ISR 전환 #925
 * 이후 (home) 레이아웃은 쿠키를 읽지 않는다 — auth_hint 는 보호 라우트 미들웨어 전용).
 *
 * 홈 ISR(#925) 계약: 정적 HTML 은 항상 미인증 슬롯으로 페인트되므로 하이드레이션 전
 * 로그인 버튼 프레임은 정상이다(A′ 서버 시드의 "0프레임" 보장은 서버 시드와 함께 제거).
 * 남는 불변식 — 유저 메뉴가 한 번 그려진 뒤 로그인 버튼으로 되돌아가는 프레임이 없다(단조 정정).
 *
 * 관측 방식: addInitScript 로 rAF 마다 헤더/본문 상태를 적어 두고, 안정 상태에 도달한 뒤
 * "그 사이 한 프레임이라도 X 가 보였는가"를 되짚는다. 사후 스냅샷으로는 첫 프레임의 깜빡임
 * (로그인 버튼·권한 거부·자리표시)을 잡을 수 없다.
 *
 * 주의: 홈(/)의 서버 컴포넌트는 빌드/ISR 재생성 시점에 Node 프로세스에서 백엔드를 호출한다 —
 * context.route 는 브라우저 요청만 가로채므로 그 호출은 실제로 나간다(공개 조회 엔드포인트,
 * 쿠키 미동봉). 백엔드가 없어도 home-data 가 빈 결과로 폴백하므로 관측 대상(헤더·가드)에는
 * 영향이 없다.
 */

const API_HOST = 'https://api.duings.com';

const TEST_USER = {
  id: 9001,
  studentId: '20240001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'JUNIOR',
  role: 'STUDENT',
  college: 'IT_ENGINEERING',
  major: '컴퓨터공학',
};

/** 목록 스텁 — 찜 방향 검증에 쓰는 두 건. 1번만 찜한 상태로 둔다. */
const CLUB_STUBS = [
  {
    id: 1,
    name: '두잉 코딩',
    category: 'ACADEMIC',
    division: null,
    college: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    tagline: '함께 만드는 개발 동아리',
    centralClub: true,
    activeRecruitment: null,
  },
  {
    id: 2,
    name: '두잉 사진',
    category: 'ART',
    division: null,
    college: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    tagline: null,
    centralClub: false,
    activeRecruitment: null,
  },
];
const FAVORITED_CLUB_IDS = [1];

const HAD_SESSION_KEY = 'duing:had-session';
const NOTIFICATIONS_LOGIN_TEXT = '알림은 로그인 후 확인할 수 있어요.';
const NOTIFICATIONS_LOGIN_LINK_SELECTOR = 'a[href="/login?next=/notifications"]';
const ADMIN_DENIED_TEXT = '총동연(관리자) 권한이 필요합니다.';
const ADMIN_CONSOLE_HEADING = '동아리 관리';
const ME_GUARD_TEXT = '로그인이 필요한 페이지예요';
const ME_TAB_LABEL = '지원 현황';
const SESSION_EXPIRED_TOAST = '세션이 만료되었어요. 다시 로그인해 주세요.';
const SESSION_UNCONFIRMED_TOAST = '세션을 확인하지 못했습니다. 로그인 상태는 유지됩니다.';

/* ────────────────────────── auth_hint 서명 ────────────────────────── */

// 시크릿은 저장소에 적지 않는다(공개 레포). 서버(next start)가 읽는 .env.local 을 그대로 읽어
// 같은 값을 쓴다 — 여기서 값이 어긋나면 미들웨어가 조용히 미인증으로 판정해 스펙이 오답을 낸다.
let cachedHintSecret: string | null = null;

function authHintSecret(): string {
  if (cachedHintSecret !== null) return cachedHintSecret;
  const fromEnv = process.env.E2E_AUTH_HINT_SECRET?.trim();
  if (fromEnv) {
    cachedHintSecret = fromEnv;
    return cachedHintSecret;
  }
  const envFilePath = join(dirname(test.info().project.testDir), '.env.local');
  const assignment = readFileSync(envFilePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('AUTH_HINT_SECRET='));
  const secret = assignment?.slice('AUTH_HINT_SECRET='.length).trim();
  if (!secret) {
    throw new Error(
      `AUTH_HINT_SECRET 을 찾지 못했습니다: ${envFilePath} 에 설정하거나 E2E_AUTH_HINT_SECRET 으로 주입하세요.`,
    );
  }
  cachedHintSecret = secret;
  return cachedHintSecret;
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function signAuthHint(role: 'STUDENT' | 'ADMIN', expiresInSeconds = 3600): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      typ: 'AUTH_HINT',
      role,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    }),
  );
  const signature = createHmac('sha256', authHintSecret())
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** 로그인 부팅 상태 재현 — 서버 신호(auth_hint)와 클라 신호(had-session)를 함께 심는다. */
async function seedLoggedInCookies(
  context: BrowserContext,
  role: 'STUDENT' | 'ADMIN' = 'STUDENT',
): Promise<void> {
  await context.addCookies([
    { name: 'auth_hint', value: signAuthHint(role), domain: 'localhost', path: '/' },
  ]);
  await context.addInitScript((key: string) => {
    window.localStorage.setItem(key, '1');
  }, HAD_SESSION_KEY);
}

/* ────────────────────────── API 대역 ────────────────────────── */

type ApiScenario = 'valid' | 'expired' | 'anonymous' | 'refresh-unavailable';

type RouteApiOptions = {
  /** /users/me 가 돌려줄 프로필 — 관리자 케이스에서 role 을 바꾼다. */
  user?: typeof TEST_USER;
  /** 찜 목록 응답 지연(ms) — "방향 모름" 구간을 관측 가능한 폭으로 벌린다. */
  favoriteIdsDelayMs?: number;
};

type ApiHarness = {
  meCalls(): number;
  refreshCalls(): number;
  /** 부팅 이후 시나리오 전환 — 검증된 세션이 뒤늦게 만료되는 상황을 재생한다. */
  setScenario(next: ApiScenario): void;
};

async function routeApi(
  context: BrowserContext,
  initialScenario: ApiScenario,
  options: RouteApiOptions = {},
): Promise<ApiHarness> {
  const user = options.user ?? TEST_USER;
  let scenario = initialScenario;
  let accessValid = scenario === 'valid';
  let meCalls = 0;
  let refreshCalls = 0;

  const cors = {
    'access-control-allow-origin': 'http://localhost:3106',
    'access-control-allow-credentials': 'true',
  };
  const ok = (data: unknown) => JSON.stringify({ ok: true, data, message: null });
  const fail = (message: string) => JSON.stringify({ ok: false, data: null, message });
  const json = (status: number, body: string) => ({
    status,
    headers: { ...cors, 'content-type': 'application/json' },
    body,
  });
  const unauthorized = () => json(401, fail('인증이 필요합니다.'));
  const emptyPage = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false };

  await context.route(`${API_HOST}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      });
    }

    const { pathname } = new URL(request.url());

    if (pathname.endsWith('/auth/web/refresh')) {
      refreshCalls += 1;
      if (scenario === 'anonymous') return route.fulfill(unauthorized());
      if (scenario === 'refresh-unavailable') {
        return route.fulfill(json(503, fail('일시적으로 처리할 수 없습니다.')));
      }
      accessValid = true;
      return route.fulfill({ status: 204, headers: cors });
    }
    if (pathname.endsWith('/auth/web/logout')) {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (pathname.endsWith('/users/me')) {
      meCalls += 1;
      return route.fulfill(accessValid ? json(200, ok(user)) : unauthorized());
    }
    if (pathname.endsWith('/me/favorites/ids')) {
      if (!accessValid) return route.fulfill(unauthorized());
      if (options.favoriteIdsDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.favoriteIdsDelayMs));
      }
      return route.fulfill(json(200, ok({ clubIds: FAVORITED_CLUB_IDS })));
    }
    if (/\/me\/favorites\/\d+$/.test(pathname)) {
      return route.fulfill(accessValid ? json(200, ok(1)) : unauthorized());
    }
    if (pathname.endsWith('/me/notifications/unread-count')) {
      return route.fulfill(accessValid ? json(200, ok({ count: 0 })) : unauthorized());
    }
    if (pathname.endsWith('/me/notifications')) {
      return route.fulfill(accessValid ? json(200, ok(emptyPage)) : unauthorized());
    }
    // 관리자 목록은 페이지 응답을 그대로 구조분해한다(data.content) — 빈 배열 폴백이 통하지 않는다.
    if (pathname.endsWith('/admin/clubs')) {
      return route.fulfill(json(200, ok(emptyPage)));
    }
    if (pathname.endsWith('/api/v1/clubs')) {
      return route.fulfill(
        json(
          200,
          ok({ ...emptyPage, content: CLUB_STUBS, totalElements: CLUB_STUBS.length, totalPages: 1 }),
        ),
      );
    }
    // 그 밖의 API — 빈 배열. 배열 소비자(.map)와 페이지 소비자(data?.content ?? []) 양쪽에 안전하다.
    return route.fulfill(json(200, ok([])));
  });

  return {
    meCalls: () => meCalls,
    refreshCalls: () => refreshCalls,
    setScenario(next) {
      scenario = next;
      accessValid = next === 'valid';
    },
  };
}

/* ────────────────────────── 프레임 관측 ────────────────────────── */

type AuthFrame = {
  t: number;
  hasLoginButton: boolean;
  hasHeaderPlaceholder: boolean;
  hasUserMenu: boolean;
  /** 이 프레임의 본문 텍스트에서 발견된 감시 문구. */
  texts: string[];
  /** 이 프레임의 문서에 존재한 감시 셀렉터. */
  selectors: string[];
};

declare global {
  interface Window {
    __duingAuthFrames?: AuthFrame[];
  }
}

type FrameProbe = { texts?: readonly string[]; selectors?: readonly string[] };

async function recordAuthFrames(page: Page, probe: FrameProbe = {}): Promise<void> {
  await page.addInitScript(
    (given: { texts: string[]; selectors: string[] }) => {
      const frames: AuthFrame[] = [];
      window.__duingAuthFrames = frames;
      const poll = () => {
        const header = document.querySelector('header');
        const bodyText = document.body === null ? '' : (document.body.textContent ?? '');
        frames.push({
          t: performance.now(),
          hasLoginButton: header?.querySelector('a[href="/login"]') != null,
          hasHeaderPlaceholder: header?.querySelector('[role="status"]') != null,
          hasUserMenu: Array.from(header?.querySelectorAll('button') ?? []).some((node) =>
            (node.textContent ?? '').includes('님'),
          ),
          texts: given.texts.filter((needle) => bodyText.includes(needle)),
          selectors: given.selectors.filter(
            (selector) => document.querySelector(selector) !== null,
          ),
        });
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    },
    { texts: [...(probe.texts ?? [])], selectors: [...(probe.selectors ?? [])] },
  );
}

function readAuthFrames(page: Page): Promise<AuthFrame[]> {
  return page.evaluate(() => window.__duingAuthFrames ?? []);
}

// rAF 콜백은 곧 "그려진 프레임"이라, DOM 단언(레이아웃만 필요)이 첫 페인트보다 먼저 끝나면
// 기록이 0건일 수 있다. 그 상태로 프레임을 읽으면 "한 번도 안 보였다"가 공허하게 참이 된다 —
// 최종 상태가 실제로 한 프레임 이상 그려진 것을 확인한 뒤에만 되짚는다.
async function waitForHeaderFrame(
  page: Page,
  key: 'hasLoginButton' | 'hasUserMenu',
): Promise<void> {
  await page.waitForFunction(
    (frameKey: 'hasLoginButton' | 'hasUserMenu') =>
      (window.__duingAuthFrames ?? []).some((frame) => frame[frameKey]),
    key,
  );
}

async function waitForTextFrame(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    (needle: string) => (window.__duingAuthFrames ?? []).some((frame) => frame.texts.includes(needle)),
    text,
  );
}

/**
 * 하이드레이션 정합 오류(React #418·#419·#423·#425)와 렌더 페이즈 상태 갱신 경고를 모은다.
 * 후자("Cannot update a component ...")는 렌더 페이즈 시드가 남길 수 있는 흔적인데,
 * 프로덕션 React 는 이 경고를 빌드에서 제거하므로 여기서는 백스톱일 뿐 증명이 아니다 —
 * 시드가 실제로 성립했다는 증거는 아래 프레임 단언이 맡는다.
 */
const REACT_ERROR_PATTERNS = [
  /react\.dev\/errors\/(418|419|423|425)/,
  /Minified React error #(418|419|423|425)/,
  /Hydration failed/i,
  /Cannot update a component/,
];

function collectReactErrors(page: Page): string[] {
  const collected: string[] = [];
  const record = (text: string) => {
    if (REACT_ERROR_PATTERNS.some((pattern) => pattern.test(text))) collected.push(text);
  };
  page.on('console', (message) => record(message.text()));
  page.on('pageerror', (error) => record(error.message));
  return collected;
}

function currentLocation(page: Page): string {
  const url = new URL(page.url());
  return url.pathname + url.search;
}

/* ────────────────────────── metric 1·2 본체 (CPU 4x 재사용) ────────────────────────── */

type ThrottleOption = { cpuThrottlingRate?: number };

async function newThrottledPage(
  context: BrowserContext,
  { cpuThrottlingRate }: ThrottleOption,
): Promise<Page> {
  const page = await context.newPage();
  if (cpuThrottlingRate) {
    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottlingRate });
  }
  return page;
}

// 홈 ISR(#925) 이후의 로그인 사용자 홈 불변식(파일 상단 주석 참조): 유저 메뉴가 처음 그려진
// 프레임부터는 로그인 버튼 프레임이 0이어야 한다. 유저 메뉴 프레임이 아예 없으면 전체가 대상이
// 되어 어차피 위쪽 waitForHeaderFrame 단언이 먼저 실패한다.
function loginButtonFramesAfterFirstUserMenu(frames: AuthFrame[]): AuthFrame[] {
  const firstUserMenuIndex = frames.findIndex((frame) => frame.hasUserMenu);
  const observed = firstUserMenuIndex < 0 ? frames : frames.slice(firstUserMenuIndex);
  return observed.filter((frame) => frame.hasLoginButton);
}

async function assertLoggedInHomeCorrectsToUserMenu(
  context: BrowserContext,
  throttle: ThrottleOption,
): Promise<void> {
  await seedLoggedInCookies(context);
  await routeApi(context, 'expired');
  const page = await newThrottledPage(context, throttle);
  const reactErrors = collectReactErrors(page);
  await recordAuthFrames(page);

  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByRole('button', { name: /홍길동님/ })).toBeVisible();
  await waitForHeaderFrame(page, 'hasUserMenu');

  const frames = await readAuthFrames(page);
  expect(frames.length).toBeGreaterThan(0);
  expect(loginButtonFramesAfterFirstUserMenu(frames)).toHaveLength(0);
  expect(frames.filter((frame) => frame.hasHeaderPlaceholder)).toHaveLength(0);
  expect(reactErrors).toEqual([]);
}

async function assertAnonymousHomeHasNoPlaceholder(
  context: BrowserContext,
  throttle: ThrottleOption,
): Promise<void> {
  await routeApi(context, 'anonymous');
  const page = await newThrottledPage(context, throttle);
  const reactErrors = collectReactErrors(page);
  await recordAuthFrames(page);

  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('header a[href="/login"]')).toBeVisible();
  await waitForHeaderFrame(page, 'hasLoginButton');

  const frames = await readAuthFrames(page);
  const firstAuthSlotFrame = frames.find(
    (frame) => frame.hasLoginButton || frame.hasUserMenu || frame.hasHeaderPlaceholder,
  );
  expect(firstAuthSlotFrame?.hasLoginButton).toBe(true);
  expect(frames.filter((frame) => frame.hasHeaderPlaceholder)).toHaveLength(0);
  expect(frames.filter((frame) => frame.hasUserMenu)).toHaveLength(0);
  expect(currentLocation(page)).toBe('/');
  expect(reactErrors).toEqual([]);
}

/* ────────────────────────── 스펙 ────────────────────────── */

test.describe('PR-3 인증 초기 상태', () => {
  test('[metric 1†#925] 로그인 사용자 홈 하드 로드 — 하이드레이션 후 유저 메뉴 단조 정정, 오류 0', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await assertLoggedInHomeCorrectsToUserMenu(context, {});
    await context.close();
  });

  test('[metric 2] 비로그인 홈 하드 로드 — 자리표시 0프레임, 즉시 로그인 버튼', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await assertAnonymousHomeHasNoPlaceholder(context, {});
    await context.close();
  });

  test('[metric 1†#925] CPU 4x — 로그인 사용자 홈에서도 유저 메뉴 단조 정정', async ({ browser }) => {
    const context = await browser.newContext();
    await assertLoggedInHomeCorrectsToUserMenu(context, { cpuThrottlingRate: 4 });
    await context.close();
  });

  test('[metric 2] CPU 4x — 비로그인 홈에서도 자리표시 0프레임', async ({ browser }) => {
    const context = await browser.newContext();
    await assertAnonymousHomeHasNoPlaceholder(context, { cpuThrottlingRate: 4 });
    await context.close();
  });

  test('[metric 4] 관리자 /admin/clubs 하드 로드 — 권한 거부 문구 0프레임', async ({ browser }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context, 'ADMIN');
    await routeApi(context, 'valid', { user: { ...TEST_USER, role: 'ADMIN' } });
    const page = await context.newPage();
    await recordAuthFrames(page, { texts: [ADMIN_DENIED_TEXT, ADMIN_CONSOLE_HEADING] });

    await page.goto('/admin/clubs', { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: ADMIN_CONSOLE_HEADING })).toBeVisible();
    await waitForTextFrame(page, ADMIN_CONSOLE_HEADING);

    const frames = await readAuthFrames(page);
    expect(frames.filter((frame) => frame.texts.includes(ADMIN_DENIED_TEXT))).toHaveLength(0);
    await context.close();
  });

  test('access 만료 — 갱신 1회로 메뉴 유지, 로그인 버튼 0프레임', async ({ browser }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context);
    const api = await routeApi(context, 'expired');
    const page = await context.newPage();
    await recordAuthFrames(page);

    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByRole('button', { name: /홍길동님/ })).toBeVisible();
    await waitForHeaderFrame(page, 'hasUserMenu');

    // 부팅 복원 me(401) → 갱신 1회 → 재시도 me(200) 3왕복. 세 번째 me 는 하이드레이션 후
    // 유저 메뉴가 프로필을 채우는 별도 쿼리다(레버 2 미구현 — 부팅분과 공유하지 않는다).
    expect(api.refreshCalls()).toBe(1);
    expect(api.meCalls()).toBe(3);
    const frames = await readAuthFrames(page);
    expect(loginButtonFramesAfterFirstUserMenu(frames)).toHaveLength(0);
    await context.close();
  });

  test('시드가 틀린 경우(미검증 만료) — 토스트·이동 없이 로그인 버튼으로 정정', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context);
    await routeApi(context, 'anonymous');
    const page = await context.newPage();

    await page.goto('/', { waitUntil: 'commit' });
    // 시드는 미검증이라 §9.1 게이트가 부수효과를 열지 않는다 — 헤더만 조용히 정정된다.
    await expect(page.locator('header a[href="/login"]')).toBeVisible();

    expect(currentLocation(page)).toBe('/');
    await expect(page.getByText(SESSION_EXPIRED_TOAST)).toHaveCount(0);
    await expect(page.getByText(SESSION_UNCONFIRMED_TOAST)).toHaveCount(0);
    expect(await page.evaluate((key: string) => window.localStorage.getItem(key), HAD_SESSION_KEY)).toBeNull();
    await context.close();
  });

  test('검증된 세션의 만료 — 만료 토스트 + /login 이동', async ({ browser }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context);
    const api = await routeApi(context, 'valid');
    const page = await context.newPage();

    await page.goto('/clubs');
    // 프로필이 실린 메뉴 = 서버로 확인된 세션(isVerified) — 여기서부터 만료가 부수효과를 연다.
    await expect(page.getByRole('button', { name: /홍길동님/ })).toBeVisible();
    const hearts = page.locator('button[aria-label="찜 추가"], button[aria-label="찜 해제"]');
    await expect(hearts.first()).toBeEnabled();

    api.setScenario('anonymous');
    await hearts.first().click();

    await expect(page.getByText(SESSION_EXPIRED_TOAST)).toBeVisible();
    await expect.poll(() => currentLocation(page)).toBe('/login?next=%2Fclubs');
    await context.close();
  });

  test('갱신 일시 장애(503) — 로그아웃으로 뒤집히지 않는다', async ({ browser }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context);
    await routeApi(context, 'refresh-unavailable');
    const page = await context.newPage();
    await recordAuthFrames(page);

    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByText(SESSION_UNCONFIRMED_TOAST)).toBeVisible();

    // 프로필은 못 받았지만(폴백 '회원') 로그인 상태는 유지된다 — PR-2 계약.
    await expect(page.getByRole('button', { name: /회원님/ })).toBeVisible();
    await waitForHeaderFrame(page, 'hasUserMenu');
    const frames = await readAuthFrames(page);
    expect(loginButtonFramesAfterFirstUserMenu(frames)).toHaveLength(0);
    expect(await page.evaluate((key: string) => window.localStorage.getItem(key), HAD_SESSION_KEY)).toBe('1');
    await context.close();
  });

  test('로그아웃 — 로그인 버튼 노출 + had-session 제거', async ({ browser }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context);
    await routeApi(context, 'valid');
    const page = await context.newPage();

    await page.goto('/');
    await page.getByRole('button', { name: /홍길동님/ }).click();
    await page.getByRole('menuitem', { name: '로그아웃' }).click();

    await expect(page.locator('header a[href="/login"]')).toBeVisible();
    expect(await page.evaluate((key: string) => window.localStorage.getItem(key), HAD_SESSION_KEY)).toBeNull();
    await context.close();
  });

  test('탐색(/clubs) — 찜 목록 도착 전 하트 비활성, 도착 후 방향 정확', async ({ browser }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context);
    await routeApi(context, 'valid', { favoriteIdsDelayMs: 1_500 });
    const page = await context.newPage();
    await recordAuthFrames(page);

    await page.goto('/clubs', { waitUntil: 'commit' });
    const hearts = page.locator('button[aria-label="찜 추가"], button[aria-label="찜 해제"]');
    // 시드로 화면은 열리되, 방향을 모르는 동안은 누를 수 없다.
    await expect(hearts.first()).toBeDisabled();
    await expect(hearts.first()).toBeEnabled();
    await expect(hearts.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(hearts.nth(1)).toHaveAttribute('aria-pressed', 'false');

    // ExploreNav 는 A′ 라우트가 아니지만, 자리표시로 되돌아가지도 않는다.
    await waitForHeaderFrame(page, 'hasUserMenu');
    const frames = await readAuthFrames(page);
    expect(frames.filter((frame) => frame.hasHeaderPlaceholder)).toHaveLength(0);
    await context.close();
  });

  test('알림 — 로그인 부팅이면 목록이 바로 열린다', async ({ browser }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context);
    await routeApi(context, 'valid');
    const page = await context.newPage();

    await page.goto('/notifications', { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: '알림' })).toBeVisible();

    expect(currentLocation(page)).toBe('/notifications');
    await expect(page.getByText(NOTIFICATIONS_LOGIN_TEXT)).toHaveCount(0);
    await context.close();
  });

  test('알림 — 익명이면 로그인 안내가 먼저 뜨고 확정 신호 뒤에 /login 으로 replace', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const api = await routeApi(context, 'anonymous');
    const page = await context.newPage();
    await recordAuthFrames(page, {
      texts: [NOTIFICATIONS_LOGIN_TEXT],
      selectors: [NOTIFICATIONS_LOGIN_LINK_SELECTOR],
    });

    await page.goto('/notifications', { waitUntil: 'commit' });
    // 확인이 끝나기 전에도 로그인 진입점을 준다(fail-open) — 갱신이 401 이 아닌 이유로 실패하면
    // 확정 신호가 영영 서지 않으므로, 대기 화면만 두면 익명 방문자가 갇힌다.
    // 이 확정은 곧 이어질 replace 와 경합하므로 라이브 단언 대신 기록된 프레임으로 되짚는다.
    await waitForTextFrame(page, NOTIFICATIONS_LOGIN_TEXT);
    const frames = await readAuthFrames(page);
    expect(
      frames.filter((frame) => frame.selectors.includes(NOTIFICATIONS_LOGIN_LINK_SELECTOR)),
    ).not.toHaveLength(0);

    await expect.poll(() => currentLocation(page)).toBe('/login?next=/notifications');
    // 이동은 부트스트랩 401 체인(갱신 시도까지)이 끝난 뒤에만 일어난다.
    expect(api.refreshCalls()).toBeGreaterThanOrEqual(1);
    await context.close();
  });

  test('마이페이지 — 로그인 부팅이면 로그인 유도 0프레임', async ({ browser }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context);
    await routeApi(context, 'valid');
    const page = await context.newPage();
    await recordAuthFrames(page, { texts: [ME_GUARD_TEXT, ME_TAB_LABEL] });

    await page.goto('/me', { waitUntil: 'commit' });
    await expect(page.getByRole('button', { name: ME_TAB_LABEL }).first()).toBeVisible();
    await waitForTextFrame(page, ME_TAB_LABEL);

    const frames = await readAuthFrames(page);
    expect(frames.filter((frame) => frame.texts.includes(ME_GUARD_TEXT))).toHaveLength(0);
    await context.close();
  });

  test('마이페이지 — 익명이면 미들웨어가 /login 으로 돌려보낸다', async ({ browser }) => {
    const context = await browser.newContext();
    await routeApi(context, 'anonymous');
    const page = await context.newPage();

    await page.goto('/me');

    expect(currentLocation(page)).toBe('/login?next=%2Fme');
    await context.close();
  });
});
