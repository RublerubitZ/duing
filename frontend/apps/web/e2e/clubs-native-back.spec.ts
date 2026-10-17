import { expect, test, type Page } from '@playwright/test';

import {
  LIST_TITLE,
  ROUTE_TIMEOUT_MS,
  announcedText,
  announcementsBetween,
  assertListKeptAcrossDetail,
  blockViewBeacons,
  countNavigationReplaces,
  delayClubDetailApi,
  describeScrollRestoration,
  detailHeading,
  firstClubWithHeroActivities,
  firstListedCategory,
  gotoList,
  markCard,
  markTime,
  markedCardState,
  readCardClubId,
  readCardClubName,
  recordRouteAnnouncements,
  replacesTo,
  softNavigate,
  visibleCard,
  visibleCards,
  visibleClubIds,
  waitForInterceptedDetail,
  waitForList,
  warmUpInterceptRoute,
} from './clubs-native-back.helpers';

/**
 * 동아리 목록 유지(스펙 P1 §2·§5) — 데스크탑 크로미엄. dev 서버(:3000)·로컬 BE 로 판정한다: 인터셉트·슬롯·popstate 복원은 dev
 * 에서도 같은 라우터 코드다. 진입 스켈레톤·프리페치 판정은 프로덕션 빌드 몫이다(club-entry-measure.spec.ts).
 * 실행: (apps/web) npx playwright test e2e/clubs-native-back.spec.ts
 * 회원 체인은 그 동아리 회원 계정이 있어야 한다 — E2E_MEMBER_STUDENT_ID·E2E_MEMBER_PASSWORD·E2E_MEMBER_CLUB_ID(없으면 건너뛴다).
 * 로그아웃 케이스는 계정 둘(E2E_MEMBER_STUDENT_ID·E2E_MEMBER_PASSWORD)만 본다.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://localhost:8080/api/v1';
const MEMBER_STUDENT_ID = process.env.E2E_MEMBER_STUDENT_ID;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;
const MEMBER_CLUB_ID = Number(process.env.E2E_MEMBER_CLUB_ID ?? '');
// 늦은 진입 — 상세 API 를 이만큼 늦춘다(인터셉트 커밋이 데이터보다 확실히 먼저 오게).
const LATE_DETAIL_DELAY_MS = 3000;
// 공지가 뒤따라 겹치는지 보는 여유.
const ANNOUNCEMENT_SETTLE_MS = 800;

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await blockViewBeacons(page);
});

async function loginAsMember(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('학번').fill(MEMBER_STUDENT_ID ?? '');
  await page.getByLabel('비밀번호', { exact: true }).fill(MEMBER_PASSWORD ?? '');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

test.describe('목록 → 인터셉트 상세 → 뒤로', () => {
  test('카드 노드가 그대로 남고(숨김 → 다시 보임), 탭 제목이 목록 제목으로 돌아온다', async ({ page }) => {
    await assertListKeptAcrossDetail(page, (card) => card.click());
  });

  test('정렬·분야 필터를 건 목록은 왕복해도 같은 쿼리·같은 카드 노드이고, 숨은 동안 기본 조건으로 다시 받지 않는다', async ({
    page,
    request,
  }) => {
    const category = await firstListedCategory(request, API_BASE_URL);
    const listSearches: string[] = [];
    page.on('request', (sentRequest) => {
      const url = new URL(sentRequest.url());
      if (url.pathname === '/api/v1/clubs') listSearches.push(url.search);
    });
    // 직렬화 순서(serializeExploreParams: category → sort) 그대로라 첫 진입에 주소가 다시 쓰이지 않는다.
    await gotoList(page, `?category=${category}&sort=ALPHABETICAL`);
    const card = visibleCards(page).first();
    const clubId = await readCardClubId(card);
    const clubName = await readCardClubName(card);
    await markCard(card);
    listSearches.length = 0;

    await card.click();
    await expect(detailHeading(page, clubName)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await page.goBack();
    await waitForList(page);

    expect(
      listSearches.filter((search) => !search.includes(`category=${category}`) || !search.includes('sort=ALPHABETICAL')),
    ).toEqual([]);
    await expect(page).toHaveURL(new RegExp(`/clubs\\?category=${category}&sort=ALPHABETICAL$`));
    await expect(page.locator('select:visible').first()).toHaveValue('ALPHABETICAL');
    expect(await markedCardState(page, clubId)).toEqual({ connected: true, shownAsSameNode: true, insideHiddenList: false });
  });

  test('인터셉트 상세에서 데스크탑 "동아리" 링크를 누르면 상세가 닫히고 목록이 보인다', async ({ page }) => {
    await gotoList(page);
    const card = visibleCards(page).first();
    const clubName = await readCardClubName(card);
    await card.click();
    await expect(detailHeading(page, clubName)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });

    await page.locator('header a[href="/clubs"]:visible').click();
    await expect(page).toHaveURL(/\/clubs$/);
    await waitForList(page);
    await expect(detailHeading(page, clubName)).toHaveCount(0);
    await expect(page.locator('[data-clubs-hidden-list]')).toHaveCount(0);
  });

  test('상세 → 다른 상세(window.next.router.push) → 뒤로 → 뒤로 — 인터셉트가 이어지고 목록은 같은 노드로 숨었다가 돌아온다', async ({ page }) => {
    await gotoList(page);
    const firstCard = visibleCards(page).first();
    const secondCard = visibleCards(page).nth(1);
    const firstClubId = await readCardClubId(firstCard);
    const firstClubName = await readCardClubName(firstCard);
    const secondClubId = await readCardClubId(secondCard);
    const secondClubName = await readCardClubName(secondCard);
    await markCard(firstCard);

    await firstCard.click();
    await expect(detailHeading(page, firstClubName)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await softNavigate(page, `/clubs/${secondClubId}`);
    await expect(detailHeading(page, secondClubName)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(detailHeading(page, firstClubName)).toHaveCount(0);
    await expect(page.locator('[data-clubs-slot="intercepted"]')).toBeVisible();
    expect(await markedCardState(page, firstClubId)).toEqual({ connected: true, shownAsSameNode: false, insideHiddenList: true });

    await page.goBack();
    await expect(detailHeading(page, firstClubName)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await page.goBack();
    await waitForList(page);
    expect(await markedCardState(page, firstClubId)).toEqual({ connected: true, shownAsSameNode: true, insideHiddenList: false });
    await expect(page).toHaveTitle(LIST_TITLE);
  });
});

test.describe('전체 페이지', () => {
  test('하드 로드한 상세는 전체 페이지(data-clubs-slot="page")이고 제목은 서버 메타데이터다', async ({ page }) => {
    await gotoList(page);
    const card = visibleCards(page).first();
    const clubId = await readCardClubId(card);
    const clubName = await readCardClubName(card);

    await page.goto(`/clubs/${clubId}`);
    await expect(page.locator('[data-clubs-slot="page"]')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(detailHeading(page, clubName)).toBeVisible();
    await expect(page.locator('[data-clubs-hidden-list]')).toHaveCount(0);
    await expect(page).toHaveTitle(`${clubName} | 두잉`);
  });

  test('익명으로 하드 로드한 회원 화면 — 토스트 1회, /clubs/<id> 상세가 보이고 그 뒤 이동이 없다', async ({ page }) => {
    await gotoList(page);
    const clubId = await readCardClubId(visibleCards(page).first());
    await countNavigationReplaces(page);

    await page.goto(`/clubs/${clubId}/member/notices`);
    await expect(page).toHaveURL(new RegExp(`/clubs/${clubId}$`), { timeout: ROUTE_TIMEOUT_MS });
    await expect(page.locator('[data-clubs-slot="intercepted"] h1:visible')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    // 같은 문구 토스트는 떠 있는 동안 겹쳐 뜨지 않아(ToastProvider dedupe) 0·1 만 관측된다 — 실제 반복 검출은 아래 replace 카운터다.
    await expect(page.getByRole('alert').filter({ hasText: '동아리 소개 페이지로 이동합니다.' })).toHaveCount(1);

    await page.waitForTimeout(2000);
    expect(await replacesTo(page, `/clubs/${clubId}`)).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/clubs/${clubId}$`));
  });
});

test.describe('회원 체인 — 목록 → 인터셉트 상세 → 회원 화면 → 뒤로 → 뒤로', () => {
  test.skip(
    !MEMBER_STUDENT_ID || !MEMBER_PASSWORD || !Number.isInteger(MEMBER_CLUB_ID) || MEMBER_CLUB_ID <= 0,
    'E2E_MEMBER_STUDENT_ID·E2E_MEMBER_PASSWORD·E2E_MEMBER_CLUB_ID(그 동아리 회원 계정)가 없으면 건너뛴다 — 비회원이면 가드의 replace 로 다른 경로가 된다.',
  );

  test('돌아온 인터셉트 엔트리에서는 목록을 숨긴 채 새로 마운트하지 않고, 마지막 뒤로에서 목록이 원래 쿼리로 다시 그려진다', async ({ page }) => {
    await loginAsMember(page);
    await gotoList(page, '?sort=ALPHABETICAL');
    await softNavigate(page, `/clubs/${MEMBER_CLUB_ID}`);
    await waitForInterceptedDetail(page);
    const detailTitle = await page.title();
    await page.getByRole('tab', { name: '동아리 소식' }).click();
    await page.locator(`a[href="/clubs/${MEMBER_CLUB_ID}/member/notices"]:visible`).first().click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${MEMBER_CLUB_ID}/member/notices$`), { timeout: ROUTE_TIMEOUT_MS });
    await expect(page.locator('[data-clubs-slot="page"]')).toBeVisible();
    // 인터셉트를 떠나는 전환 커밋에서 공지 영역의 head 관찰이 새 화면 제목(회원 화면 head)을 덮지 않는다.
    await expect(page).not.toHaveTitle(LIST_TITLE);
    await expect(page).not.toHaveTitle(detailTitle);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/clubs/${MEMBER_CLUB_ID}$`));
    await expect(page.locator('[data-clubs-slot="intercepted"] h1:visible')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(page.locator('[data-clubs-hidden-list]')).toHaveCount(0);
    // 목록 UI(탐색 화면에만 있는 검색창)도 마운트되지 않았다 — 숨기지도, 보이게 그리지도 않는다(스펙 §3.2).
    await expect(page.getByLabel('동아리 검색')).toHaveCount(0);

    await page.goBack();
    await waitForList(page);
    // 대조 — 목록에서는 같은 라벨이 잡혀야 위의 0건 단언이 의미가 있다(라벨이 바뀌면 여기서 먼저 실패한다).
    await expect(page.getByLabel('동아리 검색')).not.toHaveCount(0);
    await expect(page).toHaveURL(/\/clubs\?sort=ALPHABETICAL$/);
    await expect(page.locator('select:visible').first()).toHaveValue('ALPHABETICAL');
  });
});

test.describe('라우트 공지 — 전환마다 한 곳에서 한 번(Next 공지기 + 라이브 영역)', () => {
  test('늦은 진입(상세 API 지연) — 앞으로는 동아리 제목, 뒤로는 목록 제목이 각각 한 번', async ({ page }) => {
    await recordRouteAnnouncements(page);
    await warmUpInterceptRoute(page);
    await gotoList(page);
    const card = visibleCards(page).first();
    const clubTitle = `${await readCardClubName(card)} | 두잉`;
    await delayClubDetailApi(page, await readCardClubId(card), LATE_DETAIL_DELAY_MS);

    const forwardAt = await markTime(page);
    await card.click();
    await expect(page).toHaveTitle(clubTitle, { timeout: ROUTE_TIMEOUT_MS });
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);
    const backAt = await markTime(page);
    await page.goBack();
    await waitForList(page);
    await expect(page).toHaveTitle(LIST_TITLE);
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);
    const endAt = await markTime(page);

    const forward = await announcementsBetween(page, forwardAt, backAt);
    const back = await announcementsBetween(page, backAt, endAt);
    console.log(`[공지] 늦은 진입 앞으로=${JSON.stringify(forward)} 뒤로=${JSON.stringify(back)}`);
    expect(forward.map(announcedText)).toEqual([clubTitle]);
    expect(back.map(announcedText)).toEqual([LIST_TITLE]);
  });

  test('커밋 전 진입 — 선조회 진입 → 소프트 뒤로 → 같은 카드 재진입(라우터 캐시 적중 = 커밋 전 진입): 재진입은 Next 공지기가 앞으로·뒤로 한 번씩 읽는다', async ({ page }) => {
    await recordRouteAnnouncements(page);
    await warmUpInterceptRoute(page);
    await gotoList(page);
    const card = visibleCards(page).first();
    const clubId = await readCardClubId(card);
    const clubTitle = `${await readCardClubName(card)} | 두잉`;
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    if (!box) throw new Error('카드 위치를 읽지 못했다');

    // 첫 진입 — 누른 채 선조회 응답을 기다렸다 놓는다. dev 는 링크 프리페치가 없어 인터셉트 페이지 청크를 놓은 뒤에 받으므로 로딩 경계가 먼저
    // 커밋돼 늦은 진입 갈래(라이브 영역)로 수렴한다 — 출처는 보지 않고 창마다 한 번만 본다.
    const detailArrived = page.waitForResponse(
      (response) => response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/v1/clubs/${clubId}`,
      { timeout: ROUTE_TIMEOUT_MS },
    );
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const forwardAt = await markTime(page);
    await page.mouse.down();
    await detailArrived;
    await page.mouse.up();
    await expect(page).toHaveTitle(clubTitle, { timeout: ROUTE_TIMEOUT_MS });
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);
    const backAt = await markTime(page);
    await page.goBack();
    await waitForList(page);
    await expect(page).toHaveTitle(LIST_TITLE);
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);

    // 재진입(라우터 캐시 적중) = 커밋 전 진입 — staleTimes.dynamic(180초) 안이라 RSC 를 다시 받지 않고, 청크·상세 쿼리(5분 신선)도 이미 있어 선조회가
    // 요청을 내지 않는다. 커밋에 데이터가 실려 같은 커밋에서 제목이 바뀌므로 Next 공지기가 읽고 라이브 영역은 (a)·(b) 모두 침묵한다(스펙 §3.6).
    // 이 값이 줄어 재진입이 늦은 진입으로 바뀌면 출처가 own 으로 나와 실패한다 — 공지 회귀가 아니라 전제(next.config.mjs staleTimes·쿼리 신선도)가 깨진 것이다.
    const reentryAt = await markTime(page);
    await card.click();
    await expect(page).toHaveTitle(clubTitle, { timeout: ROUTE_TIMEOUT_MS });
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);
    const reentryBackAt = await markTime(page);
    await page.goBack();
    await waitForList(page);
    await expect(page).toHaveTitle(LIST_TITLE);
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);
    const endAt = await markTime(page);

    const forward = await announcementsBetween(page, forwardAt, backAt);
    const back = await announcementsBetween(page, backAt, reentryAt);
    const reentryForward = await announcementsBetween(page, reentryAt, reentryBackAt);
    const reentryBack = await announcementsBetween(page, reentryBackAt, endAt);
    console.log(
      `[공지] 선조회 진입 앞으로=${JSON.stringify(forward)} 뒤로=${JSON.stringify(back)} 재진입 앞으로=${JSON.stringify(reentryForward)} 뒤로=${JSON.stringify(reentryBack)}`,
    );
    expect(forward.map(announcedText)).toEqual([clubTitle]);
    expect(back.map(announcedText)).toEqual([LIST_TITLE]);
    expect(reentryForward).toEqual([`next:${clubTitle}`]);
    expect(reentryBack).toEqual([`next:${LIST_TITLE}`]);
  });

  test('늦은 진입 뒤 라이트박스를 열고 닫은 다음 뒤로 — 뒤로는 목록 제목 한 번(라이트박스 닫기의 Next 재공지는 수용)', async ({ page, request }) => {
    await recordRouteAnnouncements(page);
    await warmUpInterceptRoute(page);
    await gotoList(page);
    const clubId = await firstClubWithHeroActivities(request, API_BASE_URL, await visibleClubIds(page));
    test.skip(clubId === null, '목록 첫 화면에 대표 활동이 있는 동아리가 없어 라이트박스 경우를 건너뛴다');
    if (clubId === null) return;
    const card = visibleCard(page, clubId);
    const clubTitle = `${await readCardClubName(card)} | 두잉`;
    await delayClubDetailApi(page, clubId, LATE_DETAIL_DELAY_MS);

    const forwardAt = await markTime(page);
    await card.click();
    await expect(page).toHaveTitle(clubTitle, { timeout: ROUTE_TIMEOUT_MS });
    await waitForInterceptedDetail(page);
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);

    const lightboxAt = await markTime(page);
    await page.getByRole('button', { name: / 자세히 보기$/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '닫기' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);

    const backAt = await markTime(page);
    await page.goBack();
    await waitForList(page);
    await expect(page).toHaveTitle(LIST_TITLE);
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);
    const endAt = await markTime(page);

    const forward = await announcementsBetween(page, forwardAt, lightboxAt);
    const lightbox = await announcementsBetween(page, lightboxAt, backAt);
    const back = await announcementsBetween(page, backAt, endAt);
    console.log(`[공지] 라이트박스 앞으로=${JSON.stringify(forward)} 라이트박스=${JSON.stringify(lightbox)} 뒤로=${JSON.stringify(back)}`);
    expect(forward.map(announcedText)).toEqual([clubTitle]);
    // 라이트박스 닫기는 같은 주소 popstate — Next 가 트리를 복원하며 처음 동아리 제목을 읽어 한 번 더 알릴 수 있다(수용, 스펙 §3.6).
    // 라이브 영역은 침묵하고, Next 재공지는 동아리 제목 최대 한 번이다.
    expect(lightbox.filter((entry) => entry !== `next:${clubTitle}`)).toEqual([]);
    expect(lightbox.length).toBeLessThanOrEqual(1);
    expect(back.map(announcedText)).toEqual([LIST_TITLE]);
  });
});

test.describe('인터셉트 상세에서 로그아웃(router.refresh)', () => {
  test.skip(!MEMBER_STUDENT_ID || !MEMBER_PASSWORD, 'E2E_MEMBER_STUDENT_ID·E2E_MEMBER_PASSWORD(회원 계정)가 없으면 건너뛴다.');

  test('늦은 진입 뒤 로그아웃 — 탭 제목 유지·라이브 영역 침묵·Next 최대 1회·숨은 목록 노드 유지·전체 새로고침 없음, 뒤로는 목록 제목 한 번', async ({ page }) => {
    await recordRouteAnnouncements(page);
    await loginAsMember(page);
    await warmUpInterceptRoute(page);
    await gotoList(page);
    const card = visibleCards(page).first();
    const clubId = await readCardClubId(card);
    const clubTitle = `${await readCardClubName(card)} | 두잉`;
    await markCard(card);
    const releaseDetailDelay = await delayClubDetailApi(page, clubId, LATE_DETAIL_DELAY_MS);

    await card.click();
    await expect(page).toHaveTitle(clubTitle, { timeout: ROUTE_TIMEOUT_MS });
    await waitForInterceptedDetail(page);
    // 로그아웃이 상세를 다시 받는다 — 지연을 풀어 다시 받은 응답이 늦지 않게 한다.
    await releaseDetailDelay();
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);
    // refresh 는 지금 주소의 RSC 를 다시 받는다 — 그 응답이 끝나면 곧 커밋돼 head 가 다시 그려진다(목록 제목).
    const refreshFinished = page.waitForEvent('requestfinished', {
      predicate: (finishedRequest) =>
        finishedRequest.headers()['rsc'] === '1' &&
        finishedRequest.headers()['next-router-prefetch'] === undefined &&
        new URL(finishedRequest.url()).pathname === `/clubs/${clubId}`,
      timeout: ROUTE_TIMEOUT_MS,
    });

    const logoutAt = await markTime(page);
    await page.locator('header').getByRole('button', { name: /님$/ }).click();
    await page.getByRole('menuitem', { name: '로그아웃' }).click();
    await refreshFinished;
    await expect(page.locator('header').getByRole('link', { name: '로그인' })).toBeVisible();
    await waitForInterceptedDetail(page);
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);
    const backAt = await markTime(page);
    const logout = await announcementsBetween(page, logoutAt, backAt);

    await expect(page).toHaveURL(new RegExp(`/clubs/${clubId}$`));
    await expect(page).toHaveTitle(clubTitle);
    // 창에 붙잡아 둔 카드 노드가 숨은 목록에 그대로 있다 — 전체 새로고침이면 창 값부터 사라진다.
    expect(await markedCardState(page, clubId)).toEqual({ connected: true, shownAsSameNode: false, insideHiddenList: true });

    await page.goBack();
    await waitForList(page);
    await expect(page).toHaveTitle(LIST_TITLE);
    await page.waitForTimeout(ANNOUNCEMENT_SETTLE_MS);
    const endAt = await markTime(page);
    const back = await announcementsBetween(page, backAt, endAt);
    console.log(`[공지] 로그아웃 늦은 진입 로그아웃=${JSON.stringify(logout)} 뒤로=${JSON.stringify(back)}`);
    expect(await markedCardState(page, clubId)).toEqual({ connected: true, shownAsSameNode: true, insideHiddenList: false });
    // refresh 커밋에서 Next 가 처음 동아리 제목을 읽어 한 번 더 알릴 수 있다(수용, 스펙 §3.6) — 라이브 영역은 침묵한다.
    expect(logout.filter((entry) => entry !== `next:${clubTitle}`)).toEqual([]);
    expect(logout.length).toBeLessThanOrEqual(1);
    expect(back.map(announcedText)).toEqual([LIST_TITLE]);
  });
});

describeScrollRestoration();
