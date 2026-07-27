import { expect, test, type Page } from '@playwright/test';

/**
 * 총동연 관리자 콘솔 회원 관리 스모크.
 *
 * <p>실제 백엔드·DB 에 붙어 도는 확인이라, 화면 단위 테스트(vitest)가 볼 수 없는 것만 담는다 —
 * 주소창에 실제로 무엇이 실리는지, 새로고침·뒤로가기가 상태를 지키는지, 좁은 폭에서 레이아웃이
 * 무너지지 않는지. 컴포넌트 분기(잠금 사유 문구 등)는 이미 vitest 가 덮고 있으므로 여기서는
 * "실제 데이터로도 그렇게 나오는가"만 본다.
 *
 * <p>계정은 환경변수로만 받는다(공개 저장소라 파일에 적지 않는다).
 * 실행: E2E_ADMIN_STUDENT_ID=... E2E_ADMIN_PASSWORD=... pnpm --filter web e2e
 *
 * <p>읽기 전용이다 — 정지·해제·강제 로그아웃은 실행하지 않는다. 실제 운영 데이터를 바꾸고
 * 감사 로그를 남기므로 실계정 수동 확인의 몫으로 남긴다.
 */

/** 화면이 접어 두는 운영 기록 건수. 이 값을 넘겨야 펼치기 버튼이 나온다. */
const COLLAPSED_ACTION_COUNT = 3;

const STUDENT_ID = process.env.E2E_ADMIN_STUDENT_ID;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.skip(
  !STUDENT_ID || !PASSWORD,
  'E2E_ADMIN_STUDENT_ID / E2E_ADMIN_PASSWORD 가 없으면 건너뛴다(계정을 레포에 넣지 않는다).',
);

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('학번').fill(STUDENT_ID ?? '');
  await page.getByLabel('비밀번호', { exact: true }).fill(PASSWORD ?? '');
  await page.getByRole('button', { name: /두잉 시작하기/ }).click();
  // 로그인 성공은 로그인 화면을 벗어나는 것으로 확인한다(착지 지점은 정책에 따라 달라질 수 있다).
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

/**
 * 목록의 첫 행이 그려질 때까지 기다린다 — 스켈레톤 상태에서 단언하면 헛스침이 된다.
 *
 * <p>표까지 기다리는 것이 핵심이다. `locator.count()` 는 재시도하지 않아서, 표가 아직 없을 때
 * 세면 0 이 나오고 그 위에 얹은 반복문이 통째로 건너뛴다 — 실패가 아니라 조용한 통과가 된다.
 */
async function gotoUserList(page: Page, query = '') {
  await page.goto(`/admin/users${query}`);
  await expect(page.getByRole('heading', { name: '회원 관리' })).toBeVisible();
  await expect(page.getByRole('list', { name: '회원 현황 요약' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test.describe('회원 목록 · 상세', () => {
  test('목록과 KPI 가 실제 데이터로 그려진다', async ({ page }) => {
    await gotoUserList(page);

    const kpis = page.getByRole('list', { name: '회원 현황 요약' });
    await expect(kpis.getByText('전체 회원')).toBeVisible();
    await expect(kpis.getByText('이용 정지')).toBeVisible();
    // 없는 지표를 빈 카드로 만들어 두지 않기로 했다 — 되살아나면 여기서 걸린다.
    await expect(kpis.getByText('오늘 활성')).toHaveCount(0);

    // 자리표시자가 아니라 실제 숫자가 도착해야 한다(조회 실패 시 무한 셔머로 남지 않는지 함께 본다).
    await expect(kpis.locator('p.text-\\[22px\\]').first()).toHaveText(/^[\d,]+$|^—$/);

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('row').nth(1)).toBeVisible();
  });

  test('상세 Sheet 가 열리고 위험 작업이 맨 아래에 온다', async ({ page }) => {
    await gotoUserList(page);
    const firstDetailButton = page.getByRole('button', { name: / 상세$/ }).first();
    await firstDetailButton.click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('계정 · 조회 전용')).toBeVisible();
    await expect(sheet.getByText('위험 작업')).toBeVisible();

    // 위험 작업이 운영 기록보다 아래에 있어야 한다 — 정보를 읽는 흐름 중간에 파괴적 버튼이 끼면 안 된다.
    const dangerTop = await sheet.getByText('위험 작업').boundingBox();
    const actionsTop = await sheet.getByText('최근 운영 기록').boundingBox();
    expect(dangerTop, '위험 작업 영역이 보여야 한다').not.toBeNull();
    expect(actionsTop, '운영 기록 영역이 보여야 한다').not.toBeNull();
    expect(dangerTop!.y).toBeGreaterThan(actionsTop!.y);

    // 원본 번호는 눌러야 나온다 — 마스킹이 기본이다.
    await expect(sheet.getByRole('button', { name: '번호 확인' })).toBeVisible();
    await expect(sheet.getByText(/\*\*\*\*/)).toBeVisible();
  });
});

test.describe('정지 버튼 권한 사전 차단', () => {
  test('다른 관리자 계정은 정지 버튼이 잠기고 사유가 화면에 보인다', async ({ page }) => {
    await gotoUserList(page);

    // 역할 열이 '관리자' 인 행을 찾는다. 본인 행도 관리자지만 어느 쪽이든 잠겨야 하므로 첫 행을 쓴다.
    const adminRow = page.getByRole('row').filter({ hasText: '관리자' }).first();
    await expect(adminRow).toBeVisible();
    await adminRow.getByRole('button', { name: / 상세$/ }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // 패널은 상세가 도착하기 전 스켈레톤 상태로 먼저 보인다 — 위험 작업 영역이 그려질 때까지
    // 기다리지 않고 버튼을 세면 항상 0 이 나온다.
    await expect(sheet.getByText('위험 작업')).toBeVisible();

    const suspendButton = sheet.getByRole('button', { name: '계정 정지', exact: true });
    const unsuspendButton = sheet.getByRole('button', { name: '정지 해제', exact: true });

    // 관리자 계정이 정지 상태일 리 없지만, 만약 그렇다면 이 단언 대상 자체가 달라진다.
    if (await suspendButton.count()) {
      await expect(suspendButton).toBeDisabled();
      await expect(
        sheet.getByText(/관리자 계정은 정지할 수 없습니다\.|자기 자신의 계정은 정지할 수 없습니다\./),
      ).toBeVisible();
    } else {
      await expect(unsuspendButton).toBeVisible();
    }

    // 강제 로그아웃은 관리자에게도 열려 있어야 한다 — 재로그인하면 복구되므로 막지 않는 것이 의도다.
    await expect(sheet.getByRole('button', { name: '로그아웃' })).toBeEnabled();
  });

  test('일반 회원은 정지 버튼이 눌린다', async ({ page }) => {
    await gotoUserList(page, '?status=ACTIVE');

    const studentRow = page.getByRole('row').filter({ hasText: '학생' }).first();
    await expect(studentRow).toBeVisible();
    await studentRow.getByRole('button', { name: / 상세$/ }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('위험 작업')).toBeVisible();
    await expect(sheet.getByRole('button', { name: '계정 정지', exact: true })).toBeEnabled();
    // 눌러서 다이얼로그가 뜨는 것까지만 본다 — 확정은 하지 않는다(실제 조치·감사 로그가 남는다).
    await sheet.getByRole('button', { name: '계정 정지', exact: true }).click();
    await expect(page.getByText('계정을 정지할까요?')).toBeVisible();
    await page.getByRole('button', { name: '취소' }).click();
    await expect(page.getByText('계정을 정지할까요?')).toHaveCount(0);
  });
});

test.describe('운영 기록 펼치기', () => {
  test('기록이 3건을 넘으면 접어 두고 펼치면 추가 조회 없이 나머지가 나온다', async ({ page }) => {
    await gotoUserList(page);

    const rows = page.getByRole('row');
    const rowCount = await rows.count();
    let expanded = false;

    for (let index = 1; index < rowCount; index += 1) {
      await rows.nth(index).getByRole('button', { name: / 상세$/ }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText('최근 운영 기록')).toBeVisible();

      const moreButton = sheet.getByRole('button', { name: /전체 기록 보기/ });
      if (await moreButton.count()) {
        // 펼치는 동안 회원 상세를 다시 부르지 않아야 한다 — 서버가 이미 20건을 함께 내려준다.
        let refetched = false;
        page.on('request', (request) => {
          if (/\/admin\/users\/\d+(\?|$)/.test(request.url())) refetched = true;
        });
        await moreButton.click();
        await expect(moreButton).toHaveCount(0);
        expect(refetched, '펼치기는 추가 조회 없이 동작해야 한다').toBe(false);
        expanded = true;
        break;
      }
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    }

    // 스킵으로 끝나면 "확인했다"로 읽히기 쉬워, 왜 확인하지 못했는지 남긴다.
    test.skip(
      !expanded,
      `운영 기록이 ${COLLAPSED_ACTION_COUNT}건을 넘는 회원이 로컬 데이터에 없어 확인할 수 없다.`,
    );
  });
});

test.describe('주소 동기화', () => {
  test('검색어는 주소에 실리지 않는다', async ({ page }) => {
    await gotoUserList(page);

    await page.getByLabel('회원 검색').fill('김');
    // 디바운스(300ms) 뒤 조회가 나가고 주소가 갱신될 여지를 준다.
    await page.waitForTimeout(1_000);

    expect(page.url()).not.toContain('q=');
    expect(page.url()).not.toContain('%EA%B9%80'); // '김' 퍼센트 인코딩
    expect(decodeURIComponent(page.url())).not.toContain('김');
  });

  test('상태·페이지는 주소에 실리고 새로고침·뒤로가기로 유지된다', async ({ page }) => {
    await gotoUserList(page);

    await page.getByRole('button', { name: '이용 정지' }).click();
    await expect(page).toHaveURL(/\?status=SUSPENDED/);

    // 새로고침해도 필터가 살아있어야 한다 — 주소에 담는 이유가 이것이다.
    await page.reload();
    await expect(page.getByRole('button', { name: '이용 정지' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page).toHaveURL(/\?status=SUSPENDED/);

    // 뒤로가기로 필터 이전 상태로 돌아온다.
    await page.goBack();
    await expect(page).not.toHaveURL(/status=SUSPENDED/);
  });

  test('주소의 잘못된 상태값은 전체 목록으로 떨어진다', async ({ page }) => {
    await gotoUserList(page, '?status=DELETED');

    // 빈 목록이 아니라 전체 목록이어야 한다 — 손으로 고친 주소가 화면을 망가뜨리지 않는다.
    await expect(page.getByRole('table')).toBeVisible();
    for (const chip of ['전체', '정상', '이용 정지']) {
      const pressed = await page
        .getByRole('button', { name: chip, exact: true })
        .getAttribute('aria-pressed');
      if (chip === '전체') expect(pressed).toBe('true');
      else expect(pressed).toBe('false');
    }
  });
});

test.describe('태블릿 레이아웃', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('768px 에서 가로 스크롤 없이 KPI 2열·툴바 줄바꿈이 유지된다', async ({ page }) => {
    await gotoUserList(page);

    // 페이지 자체가 가로로 넘치면 안 된다(표는 자기 영역 안에서만 스크롤한다).
    const overflowsHorizontally = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflowsHorizontally, '본문이 가로로 넘치면 안 된다').toBe(false);

    // KPI 두 장이 같은 줄에 있어야 한다(2열).
    const cards = page.getByRole('list', { name: '회원 현황 요약' }).getByRole('listitem');
    await expect(cards).toHaveCount(2);
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(4);
    expect(second!.x).toBeGreaterThan(first!.x);

    // 상세 패널이 화면을 넘지 않아야 한다.
    await page.getByRole('button', { name: / 상세$/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const sheetBox = await page.getByRole('dialog').boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox!.width).toBeLessThanOrEqual(768);
  });
});
