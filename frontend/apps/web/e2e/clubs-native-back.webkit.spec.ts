import { devices, expect, test } from '@playwright/test';

import { assertListKeptAcrossDetail, blockViewBeacons, describeScrollRestoration } from './clubs-native-back.helpers';

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

describeScrollRestoration();
