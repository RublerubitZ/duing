import { expect, test, type Page } from '@playwright/test';

import {
  ROUTE_TIMEOUT_MS,
  blockViewBeacons,
  detailHeading,
  expectCleanTitles,
  gotoList,
  readCardClubId,
  readCardClubName,
  visibleCards,
} from './clubs-native-back.helpers';

/**
 * 동아리 상세 진입 전환(globals.css View Transitions) — md 이상은 크로스페이드 + 로고 모핑, 모바일은 화면 전체 push 이고 로고에
 * 공유요소 이름(club-logo-<id>)이 없다. 이름이 있으면 화면이 통째로 밀리는 동안 로고만 따로 날아간다.
 * 루트 의사 요소에 걸린 애니메이션 이름은 빈 전환을 하나 열어 document.getAnimations() 로 읽는다 — 크로미엄은 전환 의사 요소의
 * 애니메이션을 effect.pseudoElement 와 함께 내준다(이 설정은 데스크탑 크로미엄 프로젝트로만 돈다). -ua-view-transition-fade-in/out 은
 * 명세 UA 스타일시트의 키프레임 이름이다. 모션 자체는 시뮬레이터 녹화로 확인한다.
 * 실행: (apps/web) 로컬 dev 서버(:3000)와 백엔드가 떠 있는 상태에서 npx playwright test e2e/club-entry-transition.spec.ts
 */
test.beforeEach(async ({ page }) => {
  await blockViewBeacons(page);
});

test.afterEach(async ({ page }) => {
  await expectCleanTitles(page);
});

/** 서버가 먼저 그린 목록(data-explore-server-list)이 실제 목록으로 바뀐 뒤의 첫 카드 — 실제로 전환을 여는 노드를 본다. */
async function firstClientCard(page: Page) {
  await gotoList(page);
  await expect(page.locator('[data-explore-server-list]')).toHaveCount(0, { timeout: ROUTE_TIMEOUT_MS });
  return visibleCards(page).first();
}

/** 빈 전환을 열어 루트 old/new 의사 요소에 걸린 CSS 애니메이션 이름을 읽는다. */
async function readRootTransitionAnimationNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const transition = document.startViewTransition(() => {});
    await transition.ready;
    const animationNames = document
      .getAnimations()
      .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
      .filter(
        (animation) =>
          animation.effect instanceof KeyframeEffect &&
          /^::view-transition-(old|new)\(root\)$/.test(animation.effect.pseudoElement ?? ''),
      )
      .map((animation) => animation.animationName);
    transition.skipTransition();
    return animationNames.sort();
  });
}

/**
 * 문서에서 지금 그려지는(rects 가 있는) 요소에 붙은 전환 이름들 — 동아리 슬롯(data-clubs-slot) 밖의 상단 내비(ExploreNav)·
 * 하단 탭바·포털도 본다. html 만 뺀다(UA 기본 이름 root 를 달고 있다).
 */
async function renderedTransitionNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('body, body *'))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => getComputedStyle(element).getPropertyValue('view-transition-name'))
      .filter((transitionName) => transitionName !== 'none'),
  );
}

test('데스크탑(1280) — 카드 로고와 상세 히어로 로고가 같은 club-logo-<id> 이름이고, 루트는 기본 크로스페이드다', async ({ page }) => {
  const card = await firstClientCard(page);
  const clubId = await readCardClubId(card);
  await expect(card.locator('[aria-label$=" 로고"]').first()).toHaveCSS('view-transition-name', `club-logo-${clubId}`);
  const rootAnimationNames = await readRootTransitionAnimationNames(page);
  expect(rootAnimationNames).toEqual(expect.arrayContaining(['-ua-view-transition-fade-in', '-ua-view-transition-fade-out']));
  expect(rootAnimationNames.filter((animationName) => animationName.startsWith('vt-push'))).toEqual([]);

  const clubName = await readCardClubName(card);
  await card.click();
  await expect(detailHeading(page, clubName)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
  // 모핑의 도착점 — 데스크탑 히어로 로고 하나만 같은 이름을 단다.
  expect(await renderedTransitionNames(page)).toEqual([`club-logo-${clubId}`]);
});

test.describe('모바일(390)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('루트는 push 로 바뀌고, 목록·인터셉트 상세에 이름 붙은 요소가 없다', async ({ page }) => {
    const card = await firstClientCard(page);
    expect(await renderedTransitionNames(page)).toEqual([]);
    expect(await readRootTransitionAnimationNames(page)).toEqual(['vt-push-in', 'vt-push-out']);

    const clubName = await readCardClubName(card);
    await card.click();
    await expect(detailHeading(page, clubName)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
    // 인터셉트 상세로 열렸는지 — 전체 페이지로 열리면 숨은 목록이 없어 아래 단언이 숨은 목록을 보지 않고 통과한다.
    await expect(page.locator('[data-clubs-slot="intercepted"]')).toHaveCount(1);
    expect(await renderedTransitionNames(page)).toEqual([]);
  });
});
