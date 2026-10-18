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

// 모바일 숨은 목록은 display:none 대신 크림 배경 뒤(음수 z-index)에 그려 둔 채 덮는다(ClubsSlotFrame) — 가려지는 전제는 래퍼와 루트 사이
// 조상이 쌓임 맥락을 만들지 않고 레이아웃 루트(.duing)가 불투명 배경으로 화면을 덮는 것이다. 조상에 transform 등이 생기면 목록이 비친다.
test('인터셉트 상세 동안 목록은 크림 배경 뒤에 덮여 있다 — inert·조상 쌓임 맥락 없음·불투명 배경', async ({ page }) => {
  await gotoList(page);
  await visibleCards(page).first().tap();
  await waitForInterceptedDetail(page);

  const coverage = await page.evaluate(() => {
    const hiddenList = document.querySelector('[data-clubs-hidden-list]');
    if (!(hiddenList instanceof HTMLElement)) return null;
    const stackingAncestors: string[] = [];
    for (let ancestor = hiddenList.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const createsStackingContext =
        (style.position !== 'static' && style.zIndex !== 'auto') ||
        style.transform !== 'none' ||
        style.filter !== 'none' ||
        style.opacity !== '1' ||
        style.isolation === 'isolate' ||
        style.mixBlendMode !== 'normal' ||
        style.perspective !== 'none' ||
        style.clipPath !== 'none' ||
        /transform|opacity|filter|perspective/.test(style.willChange) ||
        /paint|layout|strict|content/.test(style.contain);
      if (createsStackingContext) stackingAncestors.push(`${ancestor.tagName.toLowerCase()}.${ancestor.className}`);
    }
    const canvas = hiddenList.closest('.duing');
    const hiddenListStyle = getComputedStyle(hiddenList);
    return {
      inert: hiddenList.inert,
      position: hiddenListStyle.position,
      behindCanvas: Number(hiddenListStyle.zIndex) < 0,
      stackingAncestors,
      // 계산된 배경색이 rgb(...) 면 불투명, rgba(...) 면 반투명이다.
      canvasOpaque: canvas !== null && getComputedStyle(canvas).backgroundColor.startsWith('rgb('),
      canvasCoversViewport: canvas !== null && canvas.getBoundingClientRect().height >= window.innerHeight,
    };
  });
  expect(coverage).toEqual({
    inert: true,
    position: 'fixed',
    behindCanvas: true,
    stackingAncestors: [],
    canvasOpaque: true,
    canvasCoversViewport: true,
  });
});

describeScrollRestoration();
