import { expect, test, type Locator, type Page, type Response } from '@playwright/test';

import {
  ROUTE_TIMEOUT_MS,
  apiData,
  boxOf,
  card,
  collectPageErrors,
  expectNoHorizontalOverflow,
  failApi,
  field,
  firstRowCount,
  headline,
  installReadOnlyGuard,
  list,
  loadingStatus,
  login,
  num,
  pageHeading,
  recordApiRequests,
  str,
  todayLabel,
  won,
} from './dashboard-home.helpers';

/**
 * 총동연 홈(/admin) 스모크 — 실제 백엔드·개발 DB 에 붙어 vitest(API 목)가 못 보는 것만 본다:
 * 머리말·8칸·대기열·오른쪽 카드가 실제 API 값과 같은지, 칸·행이 실제 목록·상세에 도착해 주소의 첫 필터를 거는지
 * (운영 중단 미결 탭이 status=INACTIVE&needsPendingCleanup=true 로 바꿔 보내 400 을 피하는지 포함),
 * 비관리자가 관리자 API 를 부르지 않는지, 폭마다 배치가 규칙을 따르는지.
 *
 * <p>실행(apps/web): PLAYWRIGHT_NO_COPY_PROMPT=1 E2E_BASE_URL=http://localhost:3011 E2E_API_BASE_URL=http://localhost:8091/api/v1 \
 *   pnpm exec playwright test e2e/admin-home.smoke.spec.ts --project=desktop
 * 계정은 환경변수로만 받는다 — 총동연 E2E_ADMIN_STUDENT_ID·E2E_ADMIN_PASSWORD, 비관리자 회원 E2E_MEMBER_STUDENT_ID·E2E_MEMBER_PASSWORD.
 * 없으면 그 묶음을 건너뛴다.
 *
 * <p>실패 기록(test-results/ 의 error-context.md)에 남는 것과 뒤처리는 dashboard-home.helpers.ts 머리말을 본다.
 *
 * <p>읽기 전용이다 — 쓰기 요청과 열람 감사 GET 은 installReadOnlyGuard 가 서버에 닿기 전에 끊고 테스트를 실패시킨다.
 * 자정(23:59~00:02 KST)에는 돌리지 않는다(오늘 회비 활동·최근 7일 흐름·일수가 요청 사이에 바뀐다).
 * 테스트마다 로그인해 세션을 하나씩 만든다 — 동시 세션 상한이 기본값(5)인 백엔드에서는 같은 계정의 다른 세션이 밀려난다.
 */

const ADMIN_STUDENT_ID = process.env.E2E_ADMIN_STUDENT_ID;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const MEMBER_STUDENT_ID = process.env.E2E_MEMBER_STUDENT_ID;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;
const HOME_CARD_TITLES = ['처리 대기열', '처리 대기 추이', '회비 감사 요약', '학교 반영 대기', '자동 작업'];
/** 화면이 아는 자동 작업 키(adminJobStatusPresentation.ts) — 모르는 키는 그리지 않는다. */
const KNOWN_JOB_KEYS = new Set([
  'RECRUITMENT_AUTO_CLOSE',
  'APPLICATION_PENDING_REMINDER',
  'FACILITY_RESERVATION_CRAWL',
  'FACILITY_BOOKING_MATCHING',
  'FEDERATION_INQUIRY_PURGE',
]);
const WARNING_HEALTHS = new Set(['PARTIAL', 'FAILED', 'OVERDUE']);
const QUEUE_ROW_HREF =
  /^\/admin\/((reports|inquiries|recruitments|promotion-requests|leader-succession)\/\d+|facility-bookings\?tab=review|clubs(\?status=INACTIVE_PENDING)?)$/;
const QUEUE_DETAIL_HREF = /^\/admin\/(reports|inquiries|recruitments|promotion-requests|leader-succession)\/\d+$/;
/** 대기열 행 도착 h1 — 상세는 영역 이름, 목록 주소 행은 주소 그대로가 키다. */
const QUEUE_ARRIVAL_HEADING: Record<string, string> = {
  reports: '신고 상세',
  inquiries: '1:1 문의 상세',
  recruitments: '모집 상세',
  'promotion-requests': '홍보 요청 상세',
  'leader-succession': '승계 요청 상세',
  '/admin/facility-bookings?tab=review': '시설 예약 관리',
  '/admin/clubs': '동아리 관리',
  '/admin/clubs?status=INACTIVE_PENDING': '동아리 관리',
};
const CARD_FAILURE_TEXT = /^(일부 정보를 불러오지 못했어요\.|불러오지 못했어요\. 잠시 후 다시 시도해 주세요\.)$/;

/** 영역별 대기 칸 — 화면 순서(ADMIN_TRIAGE_TILES)와 같다. 문의 칸 주소만 실데이터로 정해진다. */
function tileSpecs(inquiryHref: string): Array<{ label: string; countKey: string; href: string }> {
  return [
    { label: '신고 미처리', countKey: 'reportUnresolved', href: '/admin/reports?status=PENDING' },
    { label: '1:1 문의 미답변', countKey: 'inquiryUnanswered', href: inquiryHref },
    { label: '시설 예약 검토', countKey: 'facilityBooking', href: '/admin/facility-bookings?tab=review' },
    { label: '미처리 지원 모집', countKey: 'stalePendingRecruitment', href: '/admin/recruitments?status=OPEN&sort=STALE' },
    { label: '홍보 요청', countKey: 'promotionRequest', href: '/admin/promotion-requests?status=PENDING' },
    { label: '회장 승계', countKey: 'leaderSuccession', href: '/admin/leader-succession?status=PENDING' },
    { label: '동아리 승인', countKey: 'clubApproval', href: '/admin/clubs' },
    { label: '운영 중단 미결', countKey: 'inactiveClubPending', href: '/admin/clubs?status=INACTIVE_PENDING' },
  ];
}

function tileRegion(page: Page): Locator {
  return page.getByRole('region', { name: '영역별 대기', exact: true });
}

function tileLink(page: Page, label: string): Locator {
  return tileRegion(page).getByRole('link').filter({ hasText: label });
}

/**
 * 칸을 누르고 도착 목록의 첫 조회 응답을 기다린다. 조건에는 경로와 size 만 넣는다 — 확인할 값(status 등)을 넣으면
 * 회귀가 값 불일치 대신 시간 초과로만 보인다. 홈의 같은 경로 조회는 size 100 이라 걸리지 않는다.
 */
async function openTile(page: Page, label: string, listApiPath: string | null): Promise<Response | null> {
  const listResponse =
    listApiPath === null
      ? null
      : page.waitForResponse(
          (response) => {
            const responseUrl = new URL(response.url());
            return responseUrl.pathname === `/api/v1/${listApiPath}` && responseUrl.searchParams.get('size') === '20';
          },
          { timeout: ROUTE_TIMEOUT_MS },
        );
  await tileLink(page, label).click();
  return listResponse;
}

function expectListRequest(listResponse: Response | null, expectedParams: Record<string, string>): void {
  if (listResponse === null) throw new Error('목록 응답을 기다리지 않았다');
  const searchParams = new URL(listResponse.url()).searchParams;
  for (const [key, value] of Object.entries(expectedParams)) {
    expect(searchParams.get(key), `${listResponse.url()} 의 ${key}`).toBe(value);
  }
  expect(listResponse.status(), `${listResponse.url()} 응답 코드`).toBe(200);
}

async function backToHome(page: Page, homeHeadline: string): Promise<void> {
  await page.goBack();
  await expect(tileRegion(page)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
  await expect(headline(page)).toHaveText(homeHeadline);
}

// trace 에는 로그인 요청 본문이 평문으로 남고, 실패 스크린샷에는 실명·학번이 든 화면이 남는다.
test.use({ trace: 'off', screenshot: 'off' });
test.describe.configure({ timeout: 120_000 });

let violations: string[] = [];
let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  violations = await installReadOnlyGuard(page);
  pageErrors = collectPageErrors(page);
});

test.afterEach(() => {
  expect(violations, '실서버로 나간 쓰기 요청').toEqual([]);
  expect(pageErrors, '페이지 오류·하이드레이션 경고').toEqual([]);
});

test.describe('진입 차단', () => {
  test('익명은 로그인 화면으로 가고 관리자 API 를 부르지 않는다', async ({ page }) => {
    const apiRequests = recordApiRequests(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/, { timeout: ROUTE_TIMEOUT_MS });
    expect(apiRequests.filter((requestUrl) => requestUrl.pathname.startsWith('/api/v1/admin/')).map((requestUrl) => requestUrl.pathname)).toEqual([]);
  });

  test('비관리자는 주소 그대로 403 화면을 보고 관리자 API 를 부르지 않는다', async ({ page }) => {
    test.skip(
      !MEMBER_STUDENT_ID || !MEMBER_PASSWORD,
      'E2E_MEMBER_STUDENT_ID / E2E_MEMBER_PASSWORD 가 없으면 건너뛴다(계정을 레포에 넣지 않는다).',
    );
    const apiRequests = recordApiRequests(page);
    await login(page, MEMBER_STUDENT_ID ?? '', MEMBER_PASSWORD ?? '', '/admin');
    // 미들웨어 rewrite 라 주소는 그대로이고 응답은 200 이다 — 상태 코드로 판정하지 않는다.
    await expect(page).toHaveURL(/\/admin$/);
    await expect(pageHeading(page, '접근 권한이 없어요.')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(page.getByRole('link', { name: '홈으로 돌아가기', exact: true })).toBeVisible();
    await page.goto('/admin/clubs?status=INACTIVE_PENDING');
    await expect(pageHeading(page, '접근 권한이 없어요.')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    expect(
      apiRequests.filter((requestUrl) => requestUrl.pathname.startsWith('/api/v1/admin/')).map((requestUrl) => requestUrl.pathname),
      '비관리자가 부른 관리자 API',
    ).toEqual([]);
  });
});

test.describe('총동연 홈', () => {
  test.skip(
    !ADMIN_STUDENT_ID || !ADMIN_PASSWORD,
    'E2E_ADMIN_STUDENT_ID / E2E_ADMIN_PASSWORD 가 없으면 건너뛴다(계정을 레포에 넣지 않는다).',
  );

  let pendingCounts: unknown = null;

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN_STUDENT_ID ?? '', ADMIN_PASSWORD ?? '', '/admin');
    // 그 전에는 '권한 확인 중' 게이트다.
    await expect(pageHeading(page, '총동연 관리자')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(tileRegion(page)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    for (const title of HOME_CARD_TITLES) {
      await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    }
    await expect(loadingStatus(page)).toHaveCount(0, { timeout: ROUTE_TIMEOUT_MS });
    pendingCounts = await apiData(page, 'admin/pending-counts');
  });

  test('머리말·8칸·대기열 요약이 처리 대기 집계와 같다', async ({ page }) => {
    const totalPending = num(field(pendingCounts, 'totalPendingCount'));
    await expect(headline(page)).toHaveText(`${todayLabel()} · ${totalPending > 0 ? `처리 대기 ${totalPending}건` : '처리 대기 없음'}`);

    const receivedInquiries = num(field(await apiData(page, 'admin/federation/inquiries?status=RECEIVED&page=0&size=1'), 'totalElements'));
    const inProgressInquiries = num(
      field(await apiData(page, 'admin/federation/inquiries?status=IN_PROGRESS&page=0&size=1'), 'totalElements'),
    );
    const inquiryHref =
      receivedInquiries === 0 && inProgressInquiries > 0 ? '/admin/inquiries?status=IN_PROGRESS' : '/admin/inquiries?status=RECEIVED';
    // 집계를 받았는데 필드가 없는 칸(옛 백엔드의 운영 중단 미결)은 그리지 않는다.
    const shownTiles = tileSpecs(inquiryHref).filter((tile) => field(pendingCounts, tile.countKey) !== undefined);
    const tileLinks = tileRegion(page).getByRole('link');
    await expect(tileLinks).toHaveCount(shownTiles.length);
    for (const [index, tile] of shownTiles.entries()) {
      const tileSpans = tileLinks.nth(index).locator(':scope > span');
      await expect(tileSpans.nth(0)).toHaveText(tile.label);
      await expect(tileSpans.nth(1)).toHaveText(`${num(field(pendingCounts, tile.countKey))}건`);
      await expect(tileLinks.nth(index)).toHaveAttribute('href', tile.href);
    }
    const shownCounts = (await tileLinks.locator(':scope > span:nth-child(2)').allTextContents()).map((countText) =>
      Number(countText.replace(/건$/, '')),
    );
    expect(shownCounts.reduce((sum, shownCount) => sum + shownCount, 0), '칸 숫자 합').toBe(totalPending);
    // 0건에 경고색을 칠하면 경고가 배경이 된다 — 신고 칸만, 건수가 있을 때만 경고색이다.
    const reportLabel = tileLinks.nth(0).locator(':scope > span').nth(0);
    if (num(field(pendingCounts, 'reportUnresolved')) > 0) await expect(reportLabel).toHaveClass(/text-coral-deep/);
    else await expect(reportLabel).not.toHaveClass(/text-coral-deep/);

    const queueCard = card(page, '처리 대기열');
    const queueItems = queueCard.locator('li');
    // 건수만 아는 줄(동아리 승인 시각 모름·운영 중단 미결 목록 밖)은 행 수에서 뺀다.
    const timedRows = queueItems.filter({ hasNotText: '신청 시각을 알 수 없어요' }).filter({ hasNotText: '동아리 목록에서 확인해 주세요' });
    const timedRowCount = await timedRows.count();
    const countOnlyLineCount = (await queueItems.count()) - timedRowCount;
    expect(timedRowCount, '대기열 행 상한').toBeLessThanOrEqual(10);
    if (timedRowCount > 0) {
      await expect(queueCard.getByText(`오래 기다린 ${timedRowCount}건 · 전체 ${totalPending}건`, { exact: true })).toBeVisible();
    } else if (countOnlyLineCount > 0) {
      await expect(queueCard.getByText(`전체 ${totalPending}건`, { exact: true })).toBeVisible();
    } else {
      await expect(queueCard.getByText('처리할 대기 건이 없어요', { exact: true })).toBeVisible();
    }
    const queueHrefs = await queueCard.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    for (const queueHref of queueHrefs) expect(queueHref, '대기열 행 주소').toMatch(QUEUE_ROW_HREF);
  });

  test('8칸 도착지는 주소의 첫 필터로 목록을 연다', async ({ page }) => {
    // 도착지를 최대 8곳 처음 열어 dev 첫 컴파일이 겹칠 수 있다.
    test.setTimeout(180_000);
    const apiRequests = recordApiRequests(page);
    const homeHeadline = (await headline(page).textContent()) ?? '';

    expectListRequest(await openTile(page, '신고 미처리', 'admin/reports'), { status: 'PENDING' });
    await expect(pageHeading(page, '신고 관리')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await backToHome(page, homeHeadline);

    const inquiryHref = (await tileLink(page, '1:1 문의 미답변').getAttribute('href')) ?? '';
    const inquiryStatus = new URL(inquiryHref, 'http://localhost').searchParams.get('status') ?? '';
    // 배지용 size=1 조회는 조건의 size=20 이 거른다.
    expectListRequest(await openTile(page, '1:1 문의 미답변', 'admin/federation/inquiries'), { status: inquiryStatus });
    await expect(pageHeading(page, '1:1 문의')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await backToHome(page, homeHeadline);

    // 주소가 없어도 기본 탭이 검토라 첫 필터 적용 여부는 이 단언으로 가려지지 않는다 — 도착만 본다.
    await openTile(page, '시설 예약 검토', null);
    await expect(pageHeading(page, '시설 예약 관리')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(page.locator('#facility-ops-tab-review')).toHaveAttribute('aria-selected', 'true');
    await backToHome(page, homeHeadline);

    // 홈과 같은 조회 키라 캐시 적중이면 요청이 없다 — 요청 대신 화면 상태로 판정한다.
    await openTile(page, '미처리 지원 모집', null);
    await expect(pageHeading(page, '모집 관리')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(
      page.getByRole('group', { name: '모집 상태 필터', exact: true }).getByRole('button', { name: '마감 전', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('정렬', { exact: true })).toHaveValue('STALE');
    await backToHome(page, homeHeadline);

    expectListRequest(await openTile(page, '홍보 요청', 'admin/promotion-requests'), { status: 'PENDING' });
    await expect(pageHeading(page, '홍보 요청 관리')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await backToHome(page, homeHeadline);

    expectListRequest(await openTile(page, '회장 승계', 'admin/leader-succession-requests'), { status: 'PENDING' });
    await expect(pageHeading(page, '회장 승계 관리')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await backToHome(page, homeHeadline);

    expectListRequest(await openTile(page, '동아리 승인', 'admin/clubs'), { status: 'PENDING_APPROVAL' });
    await expect(pageHeading(page, '동아리 관리')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(page.getByRole('tab', { name: '승인 대기', exact: true })).toHaveAttribute('aria-selected', 'true');
    await backToHome(page, homeHeadline);

    if (field(pendingCounts, 'inactiveClubPending') !== undefined) {
      // 탭 값 INACTIVE_PENDING 은 status=INACTIVE&needsPendingCleanup=true 로 바꿔 보낸다 — 그대로 보내면 서버가 400 이다.
      expectListRequest(await openTile(page, '운영 중단 미결', 'admin/clubs'), { status: 'INACTIVE', needsPendingCleanup: 'true' });
      await expect(pageHeading(page, '동아리 관리')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
      await expect(page.getByRole('tab', { name: '미결 정리 필요', exact: true })).toHaveAttribute('aria-selected', 'true');
      await backToHome(page, homeHeadline);
    }

    expect(
      apiRequests.filter((requestUrl) => requestUrl.searchParams.get('status') === 'INACTIVE_PENDING').map((requestUrl) => requestUrl.href),
      'API 로 나간 status=INACTIVE_PENDING',
    ).toEqual([]);
  });

  test('오른쪽 카드가 각 API 값과 같다', async ({ page }) => {
    const feeDashboard = await apiData(page, 'admin/fees/dashboard');
    // eventCounts·newOpinionCount 는 최상위가 아니라 recentActivity 안에 있다. 0건인 종류는 키가 없다.
    const recentActivity = field(feeDashboard, 'recentActivity');
    const eventCounts = field(recentActivity, 'eventCounts');
    if (typeof eventCounts !== 'object' || eventCounts === null) throw new Error(`eventCounts 가 객체가 아니다: ${JSON.stringify(eventCounts)}`);
    const todayActivityCount =
      Object.values(eventCounts).reduce((sum: number, eventCount: unknown) => sum + num(eventCount), 0) +
      num(field(recentActivity, 'newOpinionCount'));
    const feeCard = card(page, '회비 감사 요약');
    await expect(feeCard.locator('dt:text-is("진행중 의견") + dd')).toHaveText(`${num(field(feeDashboard, 'openOpinionCount'))}건`);
    await expect(feeCard.locator('dt:text-is("오늘 회비 활동") + dd')).toHaveText(`${todayActivityCount}건`);
    await expect(feeCard.locator('dt:text-is("수납률(금액)") + dd')).toHaveText(`${num(field(feeDashboard, 'collectionRate'))}%`);
    await expect(feeCard.locator('dt:text-is("미수금") + dd')).toHaveText(won(num(field(feeDashboard, 'totalOutstanding'))));
    await expect(feeCard.locator('dt:text-is("회비 쓰는 동아리") + dd')).toHaveText(
      `${num(field(feeDashboard, 'feeUsingClubCount'))} / ${num(field(feeDashboard, 'clubCount'))}곳`,
    );
    await expect(feeCard.getByRole('link', { name: '회비 감사', exact: true })).toHaveAttribute('href', '/admin/fees');

    const bookingSummary = await apiData(page, 'admin/facility-bookings/summary');
    const approvedWaitingCount = num(field(bookingSummary, 'approvedWaitingCount'));
    const schoolSyncCard = card(page, '학교 반영 대기');
    if (approvedWaitingCount > 0) {
      await expect(schoolSyncCard.getByText(`${approvedWaitingCount}건`, { exact: true })).toBeVisible();
      await expect(
        schoolSyncCard.getByText(`가장 오래 기다림 D+${num(field(bookingSummary, 'oldestApprovedWaitingDays'))}`, { exact: true }),
      ).toBeVisible();
    } else {
      await expect(schoolSyncCard.getByText('반영 대기 없음', { exact: true })).toBeVisible();
    }
    await expect(schoolSyncCard.getByRole('link', { name: '시설 예약 관리', exact: true })).toHaveAttribute(
      'href',
      '/admin/facility-bookings?tab=review',
    );

    const pendingTrend = await apiData(page, 'admin/pending-trend');
    const recentFlow = field(pendingTrend, 'recentFlow');
    const trendCard = card(page, '처리 대기 추이');
    await expect(
      trendCard.getByText(
        `최근 ${num(field(recentFlow, 'days'))}일 접수 ${num(field(recentFlow, 'receivedCount'))}건 · 처리 ${num(field(recentFlow, 'handledCount'))}건`,
        { exact: true },
      ),
    ).toBeVisible();
    const recordedDayCount = list(field(pendingTrend, 'days')).filter((trendDay) => field(trendDay, 'totalPendingCount') !== null).length;
    if (recordedDayCount < 2) {
      await expect(trendCard.getByText('매일 자정에 하루 한 번 기록해요. 며칠 지나면 추이가 보여요.', { exact: true })).toBeVisible();
      await expect(trendCard.locator('figure')).toHaveCount(0);
    } else {
      await expect(trendCard.getByRole('img', { name: '최근 14일 처리 대기 막대그래프', exact: true })).toBeVisible();
    }

    const knownJobs = list(field(await apiData(page, 'admin/job-statuses'), 'jobs')).filter((jobStatus) =>
      KNOWN_JOB_KEYS.has(str(field(jobStatus, 'job'))),
    );
    const jobHealths = knownJobs.map((jobStatus) => str(field(jobStatus, 'health')));
    const warningCount = jobHealths.filter((jobHealth) => WARNING_HEALTHS.has(jobHealth)).length;
    const jobCard = card(page, '자동 작업');
    await expect(jobCard.locator('li')).toHaveCount(knownJobs.length);
    if (warningCount > 0) {
      await expect(jobCard.locator('header > span')).toHaveText(`확인 필요 ${warningCount}`);
      await expect(jobCard.getByText(`확인이 필요한 자동 작업이 ${warningCount}개 있어요`, { exact: true })).toBeVisible();
    } else {
      await expect(jobCard.locator('header > span')).toHaveCount(0);
      if (jobHealths.length > 0 && jobHealths.every((jobHealth) => jobHealth === 'DISABLED')) {
        await expect(jobCard.getByText('자동 작업이 모두 꺼져 있어요', { exact: true })).toBeVisible();
      } else {
        await expect(jobCard.getByText(/^(첫 실행을 기다리고 있어요|모두 제때 돌고 있어요)( · 꺼 둔 작업 \d+개)?$/)).toBeVisible();
      }
    }
  });

  test('대기열 행은 상세·목록 화면으로 열린다', async ({ page }) => {
    // 도착지를 최대 8곳 처음 열어 dev 첫 컴파일이 겹칠 수 있다.
    test.setTimeout(180_000);
    const queueHrefs = await card(page, '처리 대기열')
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    test.skip(queueHrefs.length === 0, '처리 대기열이 비어 있어 행 도착지를 볼 수 없다.');
    // 상세는 영역별(/admin/<영역>/{id}) 첫 행, 목록 주소 행은 주소별 첫 행만 연다.
    const firstHrefByGroup = new Map<string, string>();
    for (const queueHref of queueHrefs) {
      const group = QUEUE_DETAIL_HREF.exec(queueHref)?.[1] ?? queueHref;
      if (!firstHrefByGroup.has(group)) firstHrefByGroup.set(group, queueHref);
    }
    for (const [group, queueHref] of firstHrefByGroup) {
      const arrivalHeading = QUEUE_ARRIVAL_HEADING[group];
      if (arrivalHeading === undefined) throw new Error(`모르는 대기열 행 주소: ${queueHref}`);
      await card(page, '처리 대기열').locator(`a[href="${queueHref}"]`).first().click();
      await expect(page).toHaveURL(queueHref, { timeout: ROUTE_TIMEOUT_MS });
      await expect(pageHeading(page, arrivalHeading)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
      await page.goBack();
      await expect(tileRegion(page)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    }
  });

  test('폭마다 가로 넘침 없이 8칸이 2열·4열로 같은 폭이다', async ({ page }) => {
    const tileItems = tileRegion(page).getByRole('listitem');
    const tileCount = await tileItems.count();
    for (const width of [390, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
      const tileBoxes = await Promise.all(Array.from({ length: tileCount }, (_, index) => boxOf(tileItems.nth(index))));
      // grid-cols-2 lg:grid-cols-4
      expect(firstRowCount(tileBoxes), `${width}px 첫 줄 칸 수`).toBe(width < 1024 ? 2 : 4);
      const firstTileWidth = tileBoxes[0]?.width ?? 0;
      for (const tileBox of tileBoxes) expect(Math.abs(tileBox.width - firstTileWidth), `${width}px 칸 폭`).toBeLessThanOrEqual(1);
      if (width === 1280) {
        const trendBox = await boxOf(card(page, '처리 대기 추이'));
        const queueBox = await boxOf(card(page, '처리 대기열'));
        expect(Math.abs(trendBox.width - 320), '1280px 오른쪽 칸 폭').toBeLessThanOrEqual(1);
        expect(trendBox.x, '1280px 오른쪽 칸이 대기열 옆에 있어야 한다').toBeGreaterThan(queueBox.x);
      }
      if (width === 390) {
        await expect(page.getByRole('button', { name: '관리 메뉴 열기', exact: true })).toBeVisible();
        await expect(page.locator('aside[aria-label="관리자 메뉴"]')).toBeHidden();
      }
    }

    // 운영 중단 미결 칸의 도착 탭 — 좁은 폭에서 탭 묶음이 가로로 스크롤하고, 처음 그릴 때 선택 탭을 보이는 곳으로 당긴다.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/admin/clubs?status=INACTIVE_PENDING');
    await expect(pageHeading(page, '동아리 관리')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    const pendingCleanupTab = page.getByRole('tab', { name: '미결 정리 필요', exact: true });
    await expect(pendingCleanupTab).toHaveAttribute('aria-selected', 'true');
    await expectNoHorizontalOverflow(page);
    const tabBox = await boxOf(pendingCleanupTab);
    expect(tabBox.x + tabBox.width, '390px 에서 선택 탭이 화면 안에 보여야 한다').toBeLessThanOrEqual(390);
  });

  test('처리 대기 집계가 실패하면 머리말은 날짜만, 칸 숫자는 비고, 대기열에 실패 안내가 붙는다', async ({ page }) => {
    await failApi(page, 'admin/pending-counts');
    // beforeEach 가 이미 받은 캐시를 버린다.
    await page.reload();
    const queueCard = card(page, '처리 대기열');
    // 실패를 먼저 기다린다 — "날짜만"·"빈 칸"은 로딩 중에도 참이다.
    await expect(queueCard.getByText(CARD_FAILURE_TEXT)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });

    await expect(headline(page)).toHaveText(todayLabel());
    // 집계가 없으면 필드 유무로 칸을 거르지 못해 모든 칸을 그린다(AdminTriageTiles.tsx:14).
    const tileLinks = tileRegion(page).getByRole('link');
    await expect(tileLinks).toHaveCount(8);
    for (let index = 0; index < 8; index += 1) {
      await expect(tileLinks.nth(index).locator(':scope > span').nth(1)).toHaveText('');
    }
    // 요약 줄(triageQueueSummary 형식)만 본다 — 사람이 쓴 행 제목에도 "전체"가 들어갈 수 있다.
    await expect(queueCard.getByText(/^(오래 기다린 \d+건 · )?전체 \d+건$/)).toHaveCount(0);
    // 전체 메뉴 배지(AdminSectionPendingBadge)도 같은 집계를 쓴다.
    await expect(page.getByText(/건 처리 대기$/)).toHaveCount(0);
  });
});
