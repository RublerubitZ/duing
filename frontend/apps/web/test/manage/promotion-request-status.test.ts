import { describe, expect, it } from 'vitest';
import type { LatestPromotionRequest } from '@duing/types';

import { promotionRequestBadgeText } from '@/app/manage/clubs/[clubId]/_lib/promotionRequestStatus';

// 처리 시각 + 14×24h(절대시각) = 2026-10-21T03:00:00Z. 고정 시각만 넘긴다 — 실제 시계와 무관.
const HANDLED_AT = '2026-10-07T03:00:00Z';
const FOURTEEN_DAYS_LATER = new Date('2026-10-21T03:00:00Z');
const ONE_MS_BEFORE_FOURTEEN_DAYS = new Date(FOURTEEN_DAYS_LATER.getTime() - 1);

function latestRequest(overrides: Partial<LatestPromotionRequest>): LatestPromotionRequest {
  return {
    requestId: 3,
    status: 'PENDING',
    title: '가을 정기 공연 홍보',
    actionNote: null,
    createdAt: '2026-10-20T15:30:00Z',
    handledAt: null,
    ...overrides,
  };
}

describe('promotionRequestBadgeText — 처리 결과 배지는 처리 후 14일 미만일 때만', () => {
  it.each([
    ['ACCEPTED', '수락됨'],
    ['REJECTED', '거절됨'],
  ] as const)('%s 는 14일 되기 1ms 전까지 "%s" 를 돌려준다', (status, label) => {
    expect(promotionRequestBadgeText(latestRequest({ status, handledAt: HANDLED_AT }), ONE_MS_BEFORE_FOURTEEN_DAYS)).toBe(
      label,
    );
  });

  it.each(['ACCEPTED', 'REJECTED'] as const)('%s 는 정확히 14일이 되면 null 이다', (status) => {
    expect(promotionRequestBadgeText(latestRequest({ status, handledAt: HANDLED_AT }), FOURTEEN_DAYS_LATER)).toBeNull();
  });

  it('검토 대기 중은 기간과 무관하게 KST 제출일을 붙인다', () => {
    expect(promotionRequestBadgeText(latestRequest({ status: 'PENDING' }), FOURTEEN_DAYS_LATER)).toBe(
      '검토 대기 중 · 2026.10.21 제출',
    );
  });
});
