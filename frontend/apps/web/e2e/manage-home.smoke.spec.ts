import { expect, test } from '@playwright/test';

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
 * 운영진 홈(/manage/clubs/[clubId]) 스모크 — 실제 백엔드·개발 DB 에 붙어 vitest(API 목)가 못 보는 것만 본다:
 * 화면 숫자가 실제 API 값과 같은지, 행·칸 링크가 실제 화면에 도착해 주소의 첫 필터를 거는지,
 * 권한 없는 주소가 홈 데이터를 부르지 않는지, 폭마다 배치가 규칙을 따르는지.
 *
 * <p>실행(apps/web): E2E_BASE_URL=http://localhost:3011 E2E_API_BASE_URL=http://localhost:8091/api/v1 \
 *   pnpm exec playwright test e2e/manage-home.smoke.spec.ts --project=desktop
 * 계정은 환경변수로만 받는다 — 회장 E2E_LEADER_STUDENT_ID·E2E_LEADER_PASSWORD,
 * 운영 동아리가 없는 회원 E2E_MEMBER_STUDENT_ID·E2E_MEMBER_PASSWORD·E2E_MEMBER_CLUB_ID. 없으면 그 묶음을 건너뛴다.
 *
 * <p>읽기 전용이다 — 쓰기 요청과 열람 감사 GET 은 installReadOnlyGuard 가 서버에 닿기 전에 끊고 테스트를 실패시킨다.
 * 자정(23:59~00:02 KST)에는 돌리지 않는다(날짜·일수가 요청 사이에 바뀐다).
 * 테스트마다 로그인해 세션을 하나씩 만든다 — 동시 세션 상한이 기본값(5)인 백엔드에서는 같은 계정의 다른 세션이 밀려난다.
 */

const LEADER_STUDENT_ID = process.env.E2E_LEADER_STUDENT_ID;
const LEADER_PASSWORD = process.env.E2E_LEADER_PASSWORD;
const MEMBER_STUDENT_ID = process.env.E2E_MEMBER_STUDENT_ID;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;
const MEMBER_CLUB_ID = Number(process.env.E2E_MEMBER_CLUB_ID ?? '');
/** 운영 동아리 목록에 없을 동아리 — 목록에 있으면 그 테스트를 건너뛴다. */
const FOREIGN_CLUB_ID = 999999;
const HOME_CARD_TITLES = ['처리 필요 업무', '지원자 현황', '오늘 일정', '진행 중 모집', '회비 · 장부', '공지 · 일정'];
/** 차단 화면에서 나가면 안 되는 홈 데이터 조회 — 모집 통계·동아리 운영 API·홍보·가입·시설. */
const HOME_DATA_PATH = /^\/api\/v1\/(leader\/recruitments\/|leader\/clubs\/\d+\/|clubs\/\d+\/(promotion-requests|join-requests|facility-bookings))/;
const FOREIGN_CLUB_DATA_PATH = new RegExp(
  `^/api/v1/(leader/clubs/${FOREIGN_CLUB_ID}|clubs/${FOREIGN_CLUB_ID}/(promotion-requests|join-requests|facility-bookings))`,
);
const QUEUE_GROUP_HEADING = /^(지금 처리|처리 대기|확인만)$/;
const CARD_FAILURE_TEXT = /^(일부 정보를 불러오지 못했어요\.|불러오지 못했어요\. 잠시 후 다시 시도해 주세요\.)$/;

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
  test('익명은 로그인 화면으로 가고 next 에 홈 주소가 실린다', async ({ page }) => {
    await page.goto('/manage/clubs/1');
    await expect(page).toHaveURL(/\/login\?next=%2Fmanage%2Fclubs%2F1$/, { timeout: ROUTE_TIMEOUT_MS });
  });

  test('운영 동아리가 없는 회원은 차단 화면만 보고 홈 데이터를 부르지 않는다', async ({ page }) => {
    test.skip(
      !MEMBER_STUDENT_ID || !MEMBER_PASSWORD || !Number.isInteger(MEMBER_CLUB_ID) || MEMBER_CLUB_ID <= 0,
      'E2E_MEMBER_STUDENT_ID / E2E_MEMBER_PASSWORD / E2E_MEMBER_CLUB_ID 가 없으면 건너뛴다(계정을 레포에 넣지 않는다).',
    );
    const apiRequests = recordApiRequests(page);
    await login(page, MEMBER_STUDENT_ID ?? '', MEMBER_PASSWORD ?? '', `/manage/clubs/${MEMBER_CLUB_ID}`);
    const managedClubs = list(await apiData(page, 'leader/clubs/me/managed'));
    test.skip(managedClubs.length > 0, `회원 계정이 운영 동아리 ${managedClubs.length}곳을 가져 전제(0곳)가 깨졌다.`);

    await expect(pageHeading(page, '현재 운영하는 동아리가 없습니다.')).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(page.getByRole('link', { name: '홈으로 돌아가기', exact: true })).toBeVisible();
    const homeDataPaths = apiRequests.map((requestUrl) => requestUrl.pathname).filter((pathname) => HOME_DATA_PATH.test(pathname));
    expect(homeDataPaths, '차단 화면에서 나간 홈 데이터 조회').toEqual([]);
  });
});

test.describe('회장 홈', () => {
  test.skip(
    !LEADER_STUDENT_ID || !LEADER_PASSWORD,
    'E2E_LEADER_STUDENT_ID / E2E_LEADER_PASSWORD 가 없으면 건너뛴다(계정을 레포에 넣지 않는다).',
  );

  let clubId = 0;
  let managedClubs: unknown[] = [];

  test.beforeEach(async ({ page }) => {
    await login(page, LEADER_STUDENT_ID ?? '', LEADER_PASSWORD ?? '', '/manage');
    await expect(page).toHaveURL(/\/manage\/clubs\/\d+$/, { timeout: ROUTE_TIMEOUT_MS });
    clubId = Number(new URL(page.url()).pathname.split('/').pop());
    managedClubs = list(await apiData(page, 'leader/clubs/me/managed'));
    // 새 컨텍스트라 마지막에 본 동아리 기억이 없다 — /manage 는 첫 운영 동아리로 간다.
    expect(num(field(managedClubs[0], 'clubId')), '/manage 가 고른 동아리').toBe(clubId);
    for (const title of HOME_CARD_TITLES) {
      await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    }
    // 업무 큐는 통계·라운드·후보·마감 모집 통계를 이어서 부른다 — 기본 5초로는 다 기다리지 못한다.
    await expect(loadingStatus(page)).toHaveCount(0, { timeout: ROUTE_TIMEOUT_MS });
  });

  test('머리말·업무 큐 배지·묶음 건수·행 수가 같다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(str(field(managedClubs[0], 'clubName')));
    // 실데이터에서는 출처가 모두 성공해야 한다 — 날짜만 나오면(일부 실패) 여기서 실패한다.
    await expect(headline(page)).toHaveText(new RegExp(`^${todayLabel()} · (처리할 업무 \\d+건|처리할 업무 없음)$`));
    const headlineText = (await headline(page).textContent()) ?? '';
    const taskCount = Number(/처리할 업무 (\d+)건/.exec(headlineText)?.[1] ?? '0');
    const queueCard = card(page, '처리 필요 업무');
    if (taskCount === 0) {
      await expect(queueCard.getByText('처리할 업무가 없어요', { exact: true })).toBeVisible();
      await expect(queueCard.locator('header > span')).toHaveCount(0);
      return;
    }
    await expect(queueCard.locator('header > span')).toHaveText(String(taskCount));
    const groupCounts = (await queueCard.locator('h3').allTextContents()).map((groupHeading) =>
      Number(/(\d+)$/.exec(groupHeading.trim())?.[1]),
    );
    expect(groupCounts.reduce((sum, groupCount) => sum + groupCount, 0), '묶음 건수 합').toBe(taskCount);
    const rowLinks = queueCard.getByRole('link');
    await expect(rowLinks).toHaveCount(taskCount);
    const rowHrefs = await rowLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    for (const rowHref of rowHrefs) expect(rowHref, '업무 행 주소').toMatch(new RegExp(`^/manage/clubs/${clubId}/`));
  });

  test('회비 연체 행이 수납 요약과 같다', async ({ page }) => {
    const overdueCount = num(field(await apiData(page, `leader/clubs/${clubId}/fee-bills/summary`), 'overdueCount'));
    const queueCard = card(page, '처리 필요 업무');
    if (overdueCount === 0) {
      await expect(queueCard.getByRole('link').filter({ hasText: '회비 연체' })).toHaveCount(0);
      return;
    }
    const nowGroup = queueCard.locator('div:has(> h3)').filter({ has: page.locator('h3', { hasText: /^지금 처리/ }) });
    const overdueRow = nowGroup.getByRole('link').filter({ hasText: '회비 연체' }).filter({ hasText: `연체 청구 ${overdueCount}건` });
    await expect(overdueRow).toHaveCount(1);
    await expect(overdueRow).toHaveAttribute('href', `/manage/clubs/${clubId}/fees?tab=bill&status=OVERDUE`);
  });

  test('지원자 현황·진행 중 모집·회비 장부·공지 일정이 각 API 값과 같다', async ({ page }) => {
    const recruitments = list(await apiData(page, `clubs/${clubId}/recruitments`));
    // 진행 중 = raw status 가 CLOSED 가 아님(마감일만 지난 OPEN 도 심사 중이라 남는다).
    const activeRecruitments = recruitments.filter((recruitment) => field(recruitment, 'status') !== 'CLOSED');
    const totals = { total: 0, submitted: 0, onHold: 0, interviewPending: 0, accepted: 0, rejected: 0 };
    for (const recruitment of activeRecruitments) {
      const stats = await apiData(page, `leader/recruitments/${num(field(recruitment, 'id'))}/stats/summary`);
      totals.total += num(field(stats, 'total'));
      totals.submitted += num(field(stats, 'submitted'));
      totals.onHold += num(field(stats, 'onHold'));
      totals.interviewPending += num(field(stats, 'interviewPending'));
      totals.accepted += num(field(stats, 'accepted'));
      totals.rejected += num(field(stats, 'rejected'));
    }

    const applicantCard = card(page, '지원자 현황');
    const expectedTileLabels =
      activeRecruitments.length > 0
        ? [
            `검토 대기 ${totals.submitted + totals.onHold}명, 지원 완료 ${totals.submitted} + 보류 ${totals.onHold}`,
            `면접 대상 ${totals.interviewPending}명`,
            `합격 ${totals.accepted}명`,
            `불합격 ${totals.rejected}명`,
          ]
        : ['검토 대기', '면접 대상', '합격', '불합격'].map((label) => `${label}, 진행 중 모집 없음`);
    const applicantTileLinks = applicantCard.locator('li > a');
    await expect(applicantTileLinks).toHaveCount(4);
    for (const [index, expectedLabel] of expectedTileLabels.entries()) {
      await expect(applicantTileLinks.nth(index)).toHaveAttribute('aria-label', expectedLabel);
    }
    const applicantHeader = applicantCard.locator('header');
    if (activeRecruitments.length === 0) await expect(applicantHeader).toContainText('진행 중 모집 없음');
    else if (activeRecruitments.length === 1) await expect(applicantHeader).toContainText(`· 총 ${totals.total}명`);
    else await expect(applicantHeader).toContainText(`진행 중 모집 ${activeRecruitments.length}건 합산 · 총 ${totals.total}명`);
    await expect(applicantCard.getByRole('link', { name: '모집별 통계 보기', exact: true })).toHaveAttribute(
      'href',
      `/manage/clubs/${clubId}/recruitments`,
    );

    const activeCard = card(page, '진행 중 모집');
    if (activeRecruitments.length > 0) {
      await expect(activeCard.locator('header > span')).toHaveText(`${activeRecruitments.length}건`);
      const activeLinks = activeCard.getByRole('link');
      await expect(activeLinks).toHaveCount(activeRecruitments.length);
      const shownHrefs = await activeLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
      expect(shownHrefs, '진행 중 모집 행 주소').toEqual(
        activeRecruitments.map((recruitment) => `/manage/clubs/${clubId}/recruitments/${num(field(recruitment, 'id'))}`),
      );
    } else {
      await expect(activeCard.getByText('진행 중인 모집이 없어요', { exact: true })).toBeVisible();
    }

    const feeSummary = await apiData(page, `leader/clubs/${clubId}/fee-bills/summary`);
    const cashbookSummary = await apiData(page, `leader/clubs/${clubId}/cashbook/summary`);
    const feeCard = card(page, '회비 · 장부');
    if (num(field(feeSummary, 'billCount')) === 0) {
      await expect(feeCard.getByText('아직 발행된 청구가 없어요.', { exact: true })).toBeVisible();
    } else {
      await expect(feeCard.getByText(`${num(field(feeSummary, 'collectionRate'))}%`, { exact: true })).toBeVisible();
      await expect(
        feeCard.getByText(`총 ${won(num(field(feeSummary, 'totalPaid')))} / ${won(num(field(feeSummary, 'totalBilled')))}`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(feeCard.locator('dt:text-is("연체") + dd')).toHaveText(`${num(field(feeSummary, 'overdueCount'))}건`);
      await expect(feeCard.locator('dt:text-is("미납액") + dd')).toHaveText(won(num(field(feeSummary, 'outstanding'))));
    }
    await expect(feeCard.locator('dt:text-is("장부 잔액") + dd')).toHaveText(won(num(field(cashbookSummary, 'bookBalance'))));
    // 사이드바에도 '회비 관리' 링크가 있어 카드 안에서 찾는다.
    await expect(feeCard.getByRole('link', { name: '회비 관리', exact: true })).toHaveAttribute('href', `/manage/clubs/${clubId}/fees`);

    const noticeCount = num(field(await apiData(page, `clubs/${clubId}/notices?page=0&size=1`), 'totalElements'));
    const eventCount = list(await apiData(page, `clubs/${clubId}/events`)).length;
    const feedCard = card(page, '공지 · 일정');
    await expect(
      feedCard.getByText(noticeCount === 0 && eventCount === 0 ? '아직 공지·일정이 없어요' : `공지 ${noticeCount} · 일정 ${eventCount}`, {
        exact: true,
      }),
    ).toBeVisible();
    // 공개 상세는 조회 비컨 POST 를 보내 들어가지 않고 주소만 본다.
    await expect(feedCard.getByRole('link', { name: '동아리 페이지 바로가기 →', exact: true })).toHaveAttribute('href', `/clubs/${clubId}`);

    // 오늘 일정은 라운드 fan-out 을 다시 구현하지 않고 "배지 건수 = 행 수"만 본다.
    const todayCard = card(page, '오늘 일정');
    const todayBadge = todayCard.locator('header > span');
    if ((await todayBadge.count()) === 0) {
      await expect(todayCard.getByText('오늘 일정이 없어요', { exact: true })).toBeVisible();
    } else {
      const scheduleCount = Number(/^(\d+)건$/.exec(((await todayBadge.textContent()) ?? '').trim())?.[1]);
      await expect(todayCard.locator('li')).toHaveCount(scheduleCount);
    }

    await expect(page.getByRole('link', { name: '신규 모집 작성', exact: true })).toHaveAttribute(
      'href',
      `/manage/clubs/${clubId}/recruitments/new`,
    );
  });

  test('회비 연체 행은 청구 탭·연체 필터로 열리고 뒤로·앞으로 이동에도 그대로다', async ({ page }) => {
    const overdueCount = num(field(await apiData(page, `leader/clubs/${clubId}/fee-bills/summary`), 'overdueCount'));
    test.skip(overdueCount === 0, '수납 요약 연체 0건 — 업무 큐에 회비 연체 행이 없어 도착지를 볼 수 없다.');
    const homeHeadline = (await headline(page).textContent()) ?? '';
    // 조건에는 경로만 — 확인할 값(status)을 넣으면 회귀가 값 불일치 대신 시간 초과로만 보인다.
    const billListResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === `/api/v1/leader/clubs/${clubId}/fee-bills`,
      { timeout: ROUTE_TIMEOUT_MS },
    );
    await card(page, '처리 필요 업무').getByRole('link').filter({ hasText: '회비 연체' }).click();
    await expect(page).toHaveURL(`/manage/clubs/${clubId}/fees?tab=bill&status=OVERDUE`, { timeout: ROUTE_TIMEOUT_MS });
    const billTab = page.getByRole('tab', { name: '청구', exact: true });
    await expect(billTab).toHaveAttribute('aria-selected', 'true', { timeout: ROUTE_TIMEOUT_MS });
    await expect(page.getByLabel('청구 상태 필터', { exact: true })).toHaveValue('OVERDUE');
    const billResponse = await billListResponse;
    expect(new URL(billResponse.url()).searchParams.get('status'), '청구 목록 요청의 status').toBe('OVERDUE');
    expect(billResponse.status(), '청구 목록 응답 코드').toBe(200);
    const billBody: unknown = await billResponse.json();
    expect(num(field(field(billBody, 'data'), 'totalElements')), '연체 청구 목록 전체 건수').toBe(overdueCount);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/manage/clubs/${clubId}$`), { timeout: ROUTE_TIMEOUT_MS });
    await expect(headline(page)).toHaveText(homeHeadline);
    await page.goForward();
    await expect(billTab).toHaveAttribute('aria-selected', 'true', { timeout: ROUTE_TIMEOUT_MS });
  });

  test('지원자 칸은 진행 중 모집의 지원자 목록으로 바꿔 열고 뒤로 한 번에 홈이다', async ({ page }) => {
    const recruitments = list(await apiData(page, `clubs/${clubId}/recruitments`));
    // 앱(applicants/page.tsx)과 같은 규칙 — 목록 순서에서 첫 OPEN·자체 지원 모집.
    const target = recruitments.find(
      (recruitment) => field(recruitment, 'status') === 'OPEN' && field(recruitment, 'applicationMode') === 'SELF',
    );
    if (target === undefined) {
      test.skip(true, '접수 중(OPEN)·자체 지원 모집이 없어 지원자 목록 전환을 볼 수 없다.');
      return;
    }
    await card(page, '지원자 현황').getByRole('link', { name: /^검토 대기/ }).click();
    await expect(page).toHaveURL(`/manage/clubs/${clubId}/recruitments/${num(field(target, 'id'))}/applicants`, {
      timeout: ROUTE_TIMEOUT_MS,
    });
    // 가운데 /applicants 는 router.replace 라 기록에 없다.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/manage/clubs/${clubId}$`), { timeout: ROUTE_TIMEOUT_MS });
  });

  test('홍보 요청 창은 열고 닫기만 한다', async ({ page }) => {
    const latestRequest = await apiData(page, `clubs/${clubId}/promotion-requests/latest`);
    // 창이 열리면 '홍보 요청 제출' 버튼도 생겨 exact 로 찾는다.
    const promotionButton = page.getByRole('button', { name: '홍보 요청', exact: true });
    if (latestRequest !== null && field(latestRequest, 'status') === 'PENDING') {
      // 최근 요청을 받기 전에는 버튼이 열려 있다 — 잠길 때까지 기다린다.
      await expect(promotionButton).toHaveAttribute('aria-disabled', 'true');
      // click() 은 aria-disabled 버튼이 enabled 가 될 때까지 기다려 시간 초과로 멈춘다 — 좌표로 누른다.
      const buttonBox = await boxOf(promotionButton);
      await page.mouse.click(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
      // "열리지 않는다"는 재시도 단언으로 증명되지 않는다(첫 조회에 통과한다) — 잠깐 둔 뒤 센다.
      await page.waitForTimeout(500);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const describedById = await promotionButton.getAttribute('aria-describedby');
      if (describedById === null) throw new Error('잠긴 홍보 요청 버튼에 aria-describedby 가 없다');
      await expect(page.locator(`[id="${describedById}"]`)).toBeVisible();
      return;
    }
    await promotionButton.click();
    const promotionDialog = page.getByRole('dialog', { name: '홍보 요청', exact: true });
    await expect(promotionDialog).toBeVisible();
    await expect(promotionDialog.locator('section[aria-label="최근 홍보 요청"]')).toHaveCount(latestRequest === null ? 0 : 1);
    // 제출은 누르지 않는다(눌러도 가드가 끊고 테스트가 실패한다).
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('폭마다 가로 넘침 없이 지원자 칸과 두 칸 배치가 폭 규칙을 따른다', async ({ page }) => {
    const applicantTiles = card(page, '지원자 현황').locator('li');
    const menuButton = page.getByRole('button', { name: '메뉴 열기', exact: true });
    const sidebar = page.locator('aside[aria-label="운영진 콘솔 사이드바"]');
    for (const width of [390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
      await expect(applicantTiles).toHaveCount(4);
      const tileBoxes = await Promise.all([0, 1, 2, 3].map((index) => boxOf(applicantTiles.nth(index))));
      // grid-cols-2 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4 — md 는 사이드바 때문에 2열.
      expect(firstRowCount(tileBoxes), `${width}px 지원자 칸 첫 줄 수`).toBe(width < 1024 ? 2 : 4);
      if (width >= 1280) {
        const todayBox = await boxOf(card(page, '오늘 일정'));
        const queueBox = await boxOf(card(page, '처리 필요 업무'));
        expect(Math.abs(todayBox.width - 320), `${width}px 오른쪽 칸 폭`).toBeLessThanOrEqual(1);
        expect(todayBox.x, `${width}px 오른쪽 칸이 업무 큐 옆에 있어야 한다`).toBeGreaterThan(queueBox.x);
      }
      if (width < 768) {
        await expect(menuButton).toBeVisible();
        await expect(sidebar).toBeHidden();
      } else {
        await expect(menuButton).toBeHidden();
        await expect(sidebar).toBeVisible();
      }
    }
  });

  test('수납 요약 조회가 실패하면 회비 연체 행과 건수가 빠지고 일부 실패 안내가 붙는다', async ({ page }) => {
    await failApi(page, `leader/clubs/${clubId}/fee-bills/summary`);
    // beforeEach 가 이미 받은 캐시를 버린다.
    await page.reload();
    const feeCard = card(page, '회비 · 장부');
    const queueCard = card(page, '처리 필요 업무');
    // 실패를 먼저 기다린다 — "날짜만"·"건수 없음"·"h3 에 숫자 없음"은 로딩 중에도 참이다.
    await expect(feeCard.getByText('일부 정보를 불러오지 못했어요.', { exact: true })).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(queueCard.getByText(CARD_FAILURE_TEXT)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });

    await expect(headline(page)).toHaveText(todayLabel());
    await expect(queueCard.locator('header > span')).toHaveCount(0);
    for (const groupHeading of await queueCard.locator('h3').allTextContents()) {
      expect(groupHeading.trim(), '묶음 제목에 건수가 없어야 한다').toMatch(QUEUE_GROUP_HEADING);
    }
    await expect(queueCard.getByRole('link').filter({ hasText: '회비 연체' })).toHaveCount(0);
    await expect(feeCard).toContainText('장부 잔액');
    await expect(feeCard).not.toContainText('수납률');
  });

  test('면접 응답 미수집 행은 그 라운드 화면으로 열린다', async ({ page }) => {
    const interviewRows = card(page, '처리 필요 업무').getByRole('link').filter({ hasText: '면접 응답 미수집' });
    test.skip((await interviewRows.count()) === 0, '업무 큐에 면접 응답 미수집 행이 없어 라운드 화면 도착을 볼 수 없다.');
    const firstRow = interviewRows.first();
    const rowHref = await firstRow.getAttribute('href');
    if (rowHref === null) throw new Error('면접 응답 미수집 행에 href 가 없다');
    // 라운드 id 가 있으면 라운드 상세, 없으면 면접 랜딩(dashboardTaskPresentation.ts:40-45).
    expect(rowHref).toMatch(new RegExp(`^/manage/clubs/${clubId}/recruitments/\\d+/interview(/rounds/\\d+)?$`));
    await firstRow.click();
    // 두 화면 모두 주소를 다시 바꾸지 않고, 라운드 상세에는 h1 이 없어 주소만 본다.
    await expect(page).toHaveURL(rowHref, { timeout: ROUTE_TIMEOUT_MS });
  });

  test('남의 동아리 주소는 403 안내 뒤 내 콘솔로 돌아간다', async ({ page }) => {
    test.skip(
      managedClubs.some((managedClub) => num(field(managedClub, 'clubId')) === FOREIGN_CLUB_ID),
      `운영 동아리 목록에 ${FOREIGN_CLUB_ID} 가 있어 남의 동아리 주소를 만들 수 없다.`,
    );
    const apiRequests = recordApiRequests(page);
    await page.goto(`/manage/clubs/${FOREIGN_CLUB_ID}`);
    await expect(page.getByText('403 Forbidden', { exact: true })).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    await expect(pageHeading(page, '이 동아리의 운영 권한이 없습니다.')).toBeVisible();
    const foreignDataPaths = apiRequests.map((requestUrl) => requestUrl.pathname).filter((pathname) => FOREIGN_CLUB_DATA_PATH.test(pathname));
    expect(foreignDataPaths, '남의 동아리 데이터 조회').toEqual([]);
    // 999999 는 기억됐지만 목록에 없어 첫 운영 동아리로 간다(ManageShell.tsx:200-207, app/manage/page.tsx:28-31).
    await page.getByRole('link', { name: '내 운영 콘솔로 이동', exact: true }).click();
    await expect(page).toHaveURL(`/manage/clubs/${clubId}`, { timeout: ROUTE_TIMEOUT_MS });
  });
});
