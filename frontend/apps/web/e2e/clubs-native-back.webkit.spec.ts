import { devices, expect, test } from '@playwright/test';

import {
  assertListKeptAcrossDetail,
  blockViewBeacons,
  describeScrollRestoration,
  gotoList,
  visibleCards,
  waitForInterceptedDetail,
} from './clubs-native-back.helpers';

/**
 * 동아리 목록 유지(스펙 P1) — 웹킷 iPhone 13(터치). 설정에는 데스크탑 크로미엄 프로젝트뿐이라 기기·브라우저를 파일 최상단에서
 * 바꾼다(브라우저 종류는 워커 옵션이라 describe 안에서는 못 바꾼다). 처음이면 `npx playwright install webkit`.
 * 실행: (apps/web) npx playwright test e2e/clubs-native-back.webkit.spec.ts
 */
test.use({ ...devices['iPhone 13'] });
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, browserName }) => {
  // 기기 지정이 워커에 먹지 않으면 크로미엄으로 돌아 판정이 무의미하다 — 먼저 확인한다.
  expect(browserName).toBe('webkit');
  await blockViewBeacons(page);
});

test('목록 → 인터셉트 상세(탭) → 뒤로 — 카드 노드가 그대로 남고 탭 제목이 목록 제목으로 돌아온다', async ({ page }) => {
  await assertListKeptAcrossDetail(page, (card) => card.tap());
});

// 모바일 숨은 목록은 display:none 대신 크림 배경 뒤(음수 z-index)에 그려 둔 채 덮는다(ClubsSlotFrame) — 래퍼와 루트 사이 조상이 쌓임
// 맥락을 만들면(transform·isolation 등) 목록이 상세 뒤로 비친다. 속성을 나열하지 않고 화면 가운데에서 칠한 순서로 직접 확인한다.
test('인터셉트 상세 동안 목록은 크림 배경 뒤에 덮여 있다 — inert·전환 이름 끔·가림', async ({ page }) => {
  await gotoList(page);
  await visibleCards(page).first().tap();
  await waitForInterceptedDetail(page);

  const hiddenList = page.locator('[data-clubs-hidden-list]');
  await expect(hiddenList).toHaveAttribute('inert', '');
  await expect(hiddenList).toHaveCSS('position', 'fixed');
  // 숨은 목록 안 로고는 전환 이름이 없다 — 상세 로고와 club-logo-<id> 가 겹치면 전환이 건너뛰어진다.
  await expect(hiddenList.locator('[aria-label$=" 로고"]').first()).toHaveCSS('view-transition-name', 'none');

  const coverage = await page.evaluate(() => {
    const list = document.querySelector('[data-clubs-hidden-list]');
    const canvas = list?.closest('.duing');
    if (!(list instanceof HTMLElement) || !(canvas instanceof HTMLElement)) return null;
    // inert 요소는 히트 테스트에서 빠지므로 재는 동안만 뗀다. elementsFromPoint 는 위에 칠한 것부터 돌려준다.
    list.inert = false;
    const paintStack = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    list.inert = true;
    const firstListIndex = paintStack.findIndex((element) => list.contains(element));
    const canvasIndex = paintStack.indexOf(canvas);
    const canvasRect = canvas.getBoundingClientRect();
    return {
      listUnderCanvas: firstListIndex !== -1 && canvasIndex !== -1 && canvasIndex < firstListIndex,
      // 계산된 배경색이 rgb(...) 면 불투명, rgba(...) 면 반투명이다.
      canvasOpaque: getComputedStyle(canvas).backgroundColor.startsWith('rgb('),
      canvasCoversViewport: canvasRect.top <= 0 && canvasRect.bottom >= window.innerHeight,
    };
  });
  expect(coverage).toEqual({ listUnderCanvas: true, canvasOpaque: true, canvasCoversViewport: true });
});

describeScrollRestoration();
