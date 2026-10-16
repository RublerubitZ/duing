import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * 동아리 목록 유지(스펙 P1) E2E 공용 — dev 서버(:3000)·로컬 BE 기준. 크로미엄(clubs-native-back.spec.ts)·웹킷 iPhone
 * (clubs-native-back.webkit.spec.ts)이 같이 쓴다. 판별은 ClubsSlotFrame 표식(data-clubs-slot·data-clubs-hidden-list)으로 한다.
 */

export const LIST_TITLE = '동아리 탐색 | 두잉';
const DETAIL_SKELETON_LABEL = '동아리 정보 불러오는 중';
const HERO_ACTIVITY_SKELETON_LABEL = '대표 활동 불러오는 중';
// dev 서버는 경로를 처음 열 때 컴파일한다 — 이동은 길게 기다린다.
export const ROUTE_TIMEOUT_MS = 30_000;

type AnnouncementSample = { t: number; source: 'next' | 'own'; text: string };
type ScrollPosition = 'top' | 'middle' | 'bottom';
type DetailLength = 'short' | 'long';

declare global {
  interface Window {
    __clubsAnnouncements?: AnnouncementSample[];
    __clubsReplaceTargets?: string[];
  }
}

/** 상세 조회 기록 비콘은 개발 DB 집계를 늘리지 않게 막는다(이 E2E 의 관심사가 아니다). */
export async function blockViewBeacons(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/clubs\/\d+\/views$/, (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 204 }) : route.continue(),
  );
}

/** 지금 폭에서 보이는 동아리 카드 링크(데스크탑 그리드·모바일 리스트 중 보이는 쪽). */
export function visibleCards(page: Page): Locator {
  return page.locator('a[href^="/clubs/"]:visible');
}

export function visibleCard(page: Page, clubId: number): Locator {
  return page.locator(`a[href="/clubs/${clubId}"]:visible`).first();
}

export async function readCardClubId(card: Locator): Promise<number> {
  const href = await card.getAttribute('href');
  const clubId = Number(href?.split('/').pop());
  if (!Number.isInteger(clubId) || clubId <= 0) throw new Error(`카드 주소가 동아리 상세가 아니다: ${href}`);
  return clubId;
}

/** 카드 로고의 접근성 이름(`<이름> 로고`)에서 동아리 이름을 읽는다. */
export async function readCardClubName(card: Locator): Promise<string> {
  const label = await card.locator('[aria-label$=" 로고"]').first().getAttribute('aria-label');
  if (!label) throw new Error('카드 로고 라벨이 없다');
  return label.slice(0, -' 로고'.length);
}

export async function visibleClubIds(page: Page): Promise<number[]> {
  const hrefs = await visibleCards(page).evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
  const clubIds = hrefs.map((href) => Number(href.split('/').pop())).filter((clubId) => Number.isInteger(clubId) && clubId > 0);
  return [...new Set(clubIds)];
}

export async function waitForList(page: Page): Promise<void> {
  await expect(page.locator('[data-clubs-slot="list"]')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
  await expect(visibleCards(page).first()).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
}

export async function gotoList(page: Page, query = ''): Promise<void> {
  await page.goto(`/clubs${query}`);
  await waitForList(page);
}

/** 인터셉트 상세가 다 그려질 때까지 — 히어로 이름(h1)이 보이고 상세·대표 활동 스켈레톤이 없다. */
export async function waitForInterceptedDetail(page: Page): Promise<void> {
  await expect(page.locator('[data-clubs-slot="intercepted"] h1:visible')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
  await expect(page.getByRole('status', { name: DETAIL_SKELETON_LABEL })).toHaveCount(0, { timeout: ROUTE_TIMEOUT_MS });
  await expect(page.getByRole('status', { name: HERO_ACTIVITY_SKELETON_LABEL })).toHaveCount(0, { timeout: ROUTE_TIMEOUT_MS });
}

/**
 * 상세 히어로 h1. 모바일 히어로는 중앙동아리면 이름 뒤에 화면 읽기용 ' 중앙동아리'(sr-only)가 붙어 접근 이름이 '<이름> 중앙동아리' 다
 * (ClubDetailHero 모바일 블록) — 이름 정확 일치로 찾으면 웹킷 iPhone 에서 중앙동아리 카드가 타임아웃으로 멈춘다.
 */
export function detailHeading(page: Page, clubName: string): Locator {
  const escapedName = clubName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.getByRole('heading', { level: 1, name: new RegExp(`^${escapedName}( 중앙동아리)?$`) });
}

/** 상세 안에 다른 동아리로 가는 링크가 없어 상세→상세는 라우터로 민다(디버그용 노출 window.next.router — 스펙 P1 §5). */
export async function softNavigate(page: Page, href: string): Promise<void> {
  await page.evaluate((target) => {
    const nextGlobal: unknown = Reflect.get(window, 'next');
    const router: unknown = typeof nextGlobal === 'object' && nextGlobal !== null ? Reflect.get(nextGlobal, 'router') : undefined;
    const push: unknown = typeof router === 'object' && router !== null ? Reflect.get(router, 'push') : undefined;
    if (typeof push !== 'function') throw new Error('window.next.router.push 가 없다');
    Reflect.apply(push, router, [target]);
  }, href);
}

/** 카드 노드를 창에 붙잡아 둔다 — 목록이 다시 마운트되면 다른 노드가 된다. */
export async function markCard(card: Locator): Promise<void> {
  await card.evaluate((node) => {
    Reflect.set(window, '__clubsMarkedCard', node);
  });
}

export async function markedCardState(
  page: Page,
  clubId: number,
): Promise<{ connected: boolean; shownAsSameNode: boolean; insideHiddenList: boolean }> {
  return page.evaluate((id) => {
    const marked: unknown = Reflect.get(window, '__clubsMarkedCard');
    if (!(marked instanceof HTMLElement)) return { connected: false, shownAsSameNode: false, insideHiddenList: false };
    const shown = Array.from(document.querySelectorAll(`a[href="/clubs/${id}"]`)).find((node) => node.getClientRects().length > 0);
    return {
      connected: marked.isConnected,
      shownAsSameNode: shown === marked,
      insideHiddenList: marked.closest('[data-clubs-hidden-list]') !== null,
    };
  }, clubId);
}

/** 두 프레임 기다린다 — 복원·커밋 뒤 레이아웃이 끝난 값을 읽는다. */
export async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/** 목록 → 인터셉트 상세 → 뒤로 — 카드 노드가 숨은 채 남았다가 같은 노드로 다시 보이고, 탭 제목이 목록 제목이다(스펙 §2). */
export async function assertListKeptAcrossDetail(page: Page, open: (card: Locator) => Promise<void>): Promise<void> {
  await gotoList(page);
  const card = visibleCards(page).first();
  const clubId = await readCardClubId(card);
  const clubName = await readCardClubName(card);
  await markCard(card);

  await open(card);
  await expect(detailHeading(page, clubName)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
  await expect(page.locator('[data-clubs-slot="intercepted"]')).toBeVisible();
  expect(await markedCardState(page, clubId)).toEqual({ connected: true, shownAsSameNode: false, insideHiddenList: true });

  await page.goBack();
  await waitForList(page);
  expect(await markedCardState(page, clubId)).toEqual({ connected: true, shownAsSameNode: true, insideHiddenList: false });
  await expect(detailHeading(page, clubName)).toHaveCount(0);
  await expect(page).toHaveTitle(LIST_TITLE);
}

export async function scrollListTo(page: Page, position: ScrollPosition): Promise<number> {
  await page.evaluate((where) => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, where === 'top' ? 0 : where === 'middle' ? Math.floor(maxScroll / 2) : maxScroll);
  }, position);
  await settleFrames(page);
  return page.evaluate(() => window.scrollY);
}

const detailLengthCache = new Map<string, Record<DetailLength, number>>();

/** 목록 첫 화면 동아리 중 상세 문서가 가장 짧은·긴 동아리 — 폭·브라우저마다 높이가 달라 한 번 재어 둔다. */
async function resolveDetailLengths(page: Page, browserName: string): Promise<Record<DetailLength, number>> {
  const cacheKey = `${browserName}:${page.viewportSize()?.width ?? 0}`;
  const cached = detailLengthCache.get(cacheKey);
  if (cached) return cached;

  await gotoList(page);
  const candidates = (await visibleClubIds(page)).slice(0, 6);
  if (candidates.length < 2) throw new Error('목록 첫 화면에 동아리가 2곳 이상 있어야 짧은·긴 상세를 고른다');
  const heights: Array<{ clubId: number; height: number }> = [];
  for (const clubId of candidates) {
    await softNavigate(page, `/clubs/${clubId}`);
    await waitForInterceptedDetail(page);
    heights.push({ clubId, height: await page.evaluate(() => document.documentElement.scrollHeight) });
    await page.goBack();
    await waitForList(page);
  }
  heights.sort((first, second) => first.height - second.height);
  const shortest = heights[0];
  const longest = heights[heights.length - 1];
  if (!shortest || !longest) throw new Error('상세 높이를 재지 못했다');
  console.log(`[스크롤] ${cacheKey} 상세 문서 높이: ${heights.map((entry) => `${entry.clubId}=${entry.height}`).join(', ')}`);
  const lengths = { short: shortest.clubId, long: longest.clubId };
  detailLengthCache.set(cacheKey, lengths);
  return lengths;
}

const SCROLL_POSITION_LABEL: Record<ScrollPosition, string> = { top: '맨 위', middle: '중간', bottom: '1페이지 하단' };
const DETAIL_LENGTH_LABEL: Record<DetailLength, string> = { short: '짧은', long: '긴' };

/** 스크롤 위치 복원 매트릭스(스펙 P1 §2 — 오차 0) — 크로미엄·웹킷 스펙이 각각 부른다(조회 기록 비콘은 각 스펙의 beforeEach 가 막는다). */
export function describeScrollRestoration(): void {
  test.describe('스크롤 위치 복원 — 목록 맨 위·중간·1페이지 하단 × 짧은·긴 상세', () => {
    for (const position of ['top', 'middle', 'bottom'] as const) {
      for (const length of ['short', 'long'] as const) {
        test(`목록 ${SCROLL_POSITION_LABEL[position]} → ${DETAIL_LENGTH_LABEL[length]} 상세 → 뒤로 — 위치 오차 0`, async ({ page, browserName }) => {
          const detailIds = await resolveDetailLengths(page, browserName);
          await gotoList(page);
          const listScrollY = await scrollListTo(page, position);

          await softNavigate(page, `/clubs/${detailIds[length]}`);
          await waitForInterceptedDetail(page);
          // 뒤로 복원 순간 문서는 아직 상세다 — 복원 Y 가 이 값으로 잘리면(클램프) 1.5단계 트리거다(스펙 §3.5, Task 7 Step 5).
          const detailMaxScrollY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
          await page.goBack();
          await waitForList(page);
          await settleFrames(page);

          const restoredScrollY = await page.evaluate(() => window.scrollY);
          console.log(
            `[스크롤] ${browserName} ${position}×${length} 목록 Y=${listScrollY} 복원 Y=${restoredScrollY} 상세 최대 Y=${detailMaxScrollY}`,
          );
          expect(restoredScrollY).toBe(listScrollY);
        });
      }
    }
  });
}

// 라우트 공지 영역(ClubsRouteAnnouncer)은 ClubsSlotFrame 루트의 마지막 자식이다 — 자리까지 고정해 modal 안의 다른 role="status" 를 잡지 않는다.
const OWN_ANNOUNCER_SELECTOR = '[data-clubs-slot] > [role="status"]:last-child';

/** Next 공지기와 라이브 영역의 글자 변화를 rAF 마다 적는다(문서마다 새로 — addInitScript). */
export async function recordRouteAnnouncements(page: Page): Promise<void> {
  await page.addInitScript((ownAnnouncerSelector) => {
    const samples: AnnouncementSample[] = [];
    window.__clubsAnnouncements = samples;
    let lastNextText = '';
    let lastOwnText = '';
    const poll = () => {
      const nextText =
        document.querySelector('next-route-announcer')?.shadowRoot?.getElementById('__next-route-announcer__')?.textContent ?? '';
      const ownText = document.querySelector(ownAnnouncerSelector)?.textContent ?? '';
      if (nextText !== lastNextText) {
        samples.push({ t: performance.now(), source: 'next', text: nextText });
        lastNextText = nextText;
      }
      if (ownText !== lastOwnText) {
        samples.push({ t: performance.now(), source: 'own', text: ownText });
        lastOwnText = ownText;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }, OWN_ANNOUNCER_SELECTOR);
}

export async function markTime(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

/** [from, to) 사이 두 영역(Next 공지기·라이브 영역)에 나타난 비어 있지 않은 공지 — `출처:글자`. */
export async function announcementsBetween(page: Page, from: number, to: number): Promise<string[]> {
  // 기록기 자가 점검 — Next 공지기 노드(next-route-announcer 그림자 루트의 #__next-route-announcer__)나 라이브 영역 자리가 바뀌면(Next 업그레이드)
  // 기록이 조용히 멈춰 '공지 없음' 만 남는다.
  expect(
    await page.evaluate(
      (ownAnnouncerSelector) => [
        document.querySelector('next-route-announcer')?.shadowRoot?.getElementById('__next-route-announcer__') instanceof HTMLElement,
        document.querySelector(ownAnnouncerSelector) instanceof HTMLElement,
      ],
      OWN_ANNOUNCER_SELECTOR,
    ),
  ).toEqual([true, true]);
  const samples = await page.evaluate(() => window.__clubsAnnouncements ?? []);
  return samples
    .filter((sample) => sample.t >= from && sample.t < to && sample.text !== '')
    .map((sample) => `${sample.source}:${sample.text}`);
}

export const announcedText = (entry: string) => entry.slice(entry.indexOf(':') + 1);

/** 상세 API 를 늦춰 인터셉트 커밋이 데이터보다 먼저 오게 한다(늦은 진입). */
export async function delayClubDetailApi(page: Page, clubId: number, delayMs: number): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/v1/clubs/${clubId}`,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await route.continue();
    },
  );
}

/** dev 서버가 인터셉트 경로를 처음 컴파일하는 시간을 측정 밖으로 뺀다 — 공지 경우를 보기 전에 한 번 열어 둔다. */
export async function warmUpInterceptRoute(page: Page): Promise<void> {
  await gotoList(page);
  const clubIds = await visibleClubIds(page);
  const warmUpClubId = clubIds[clubIds.length - 1];
  if (warmUpClubId === undefined) throw new Error('목록에 동아리가 없다');
  await softNavigate(page, `/clubs/${warmUpClubId}`);
  await waitForInterceptedDetail(page);
}

/** Next 이동 커밋(__NA 를 실은 replaceState)의 목적지 경로를 적는다 — 가드 replace 가 몇 번 커밋됐는지 센다. */
export async function countNavigationReplaces(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const targets: string[] = [];
    window.__clubsReplaceTargets = targets;
    const nativeReplaceState = window.history.replaceState.bind(window.history);
    window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      if (typeof data === 'object' && data !== null && '__NA' in data && url !== undefined && url !== null) {
        targets.push(new URL(String(url), window.location.href).pathname);
      }
      nativeReplaceState(data, unused, url);
    };
  });
}

export async function replacesTo(page: Page, pathname: string): Promise<number> {
  return page.evaluate((target) => (window.__clubsReplaceTargets ?? []).filter((path) => path === target).length, pathname);
}

/** 로컬 BE 에 물어 대표 활동이 있는 첫 동아리 — 라이트박스 경우에 쓴다. */
export async function firstClubWithHeroActivities(
  request: APIRequestContext,
  apiBaseUrl: string,
  clubIds: number[],
): Promise<number | null> {
  for (const clubId of clubIds) {
    const response = await request.get(`${apiBaseUrl}/clubs/${clubId}/hero-activities`);
    if (!response.ok()) continue;
    const body: unknown = await response.json();
    const payload: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'data') : null;
    if (Array.isArray(payload) && payload.length > 0) return clubId;
  }
  return null;
}

/** 로컬 BE 목록 첫 동아리의 분야(enum 값) — 분야 필터를 건 목록이 비지 않게 실제로 있는 분야를 고른다. */
export async function firstListedCategory(request: APIRequestContext, apiBaseUrl: string): Promise<string> {
  const response = await request.get(`${apiBaseUrl}/clubs?size=1`);
  const body: unknown = response.ok() ? await response.json() : null;
  const payload: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'data') : null;
  const content: unknown = typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'content') : null;
  const firstClub: unknown = Array.isArray(content) ? content[0] : null;
  const category: unknown = typeof firstClub === 'object' && firstClub !== null ? Reflect.get(firstClub, 'category') : null;
  if (typeof category !== 'string' || category === '') throw new Error('로컬 BE 목록에서 분야를 읽지 못했다');
  return category;
}
