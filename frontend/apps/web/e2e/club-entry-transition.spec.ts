import { expect, test } from '@playwright/test';

import { blockViewBeacons, gotoList, visibleCards } from './clubs-native-back.helpers';

/**
 * 동아리 상세 진입 전환(globals.css View Transitions) — md 이상은 크로스페이드 + 로고 모핑, 모바일은 화면 전체 push 라 로고의
 * 공유요소 이름(club-logo-<id>)을 끈다. 이름이 남으면 화면이 통째로 밀리는 동안 로고만 따로 날아간다.
 * 의사 요소 애니메이션은 전환 중에만 있어 여기서는 카드 로고의 계산된 이름만 본다(모션은 시뮬레이터 녹화로 확인).
 */
test.beforeEach(async ({ page }) => {
  await blockViewBeacons(page);
});

async function readCardLogoTransition(page: Parameters<typeof gotoList>[0]) {
  await gotoList(page);
  const card = visibleCards(page).first();
  const logo = card.locator('[aria-label$=" 로고"]').first();
  const clubId = Number((await card.getAttribute('href'))?.split('/').pop());
  const transitionName = await logo.evaluate((node) => getComputedStyle(node).getPropertyValue('view-transition-name'));
  return { clubId, transitionName };
}

test('데스크탑(1280) — 카드 로고는 club-logo-<id> 이름으로 상세 히어로와 모핑한다', async ({ page }) => {
  const { clubId, transitionName } = await readCardLogoTransition(page);
  expect(transitionName).toBe(`club-logo-${clubId}`);
});

test.describe('모바일(390)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('카드 로고의 공유요소 이름이 꺼져 있다 — 전환은 화면 전체 push', async ({ page }) => {
    const { transitionName } = await readCardLogoTransition(page);
    expect(transitionName).toBe('none');
  });
});
