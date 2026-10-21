import { describe, expect, it } from 'vitest';
import type { LatestLeaderSuccessionRequest } from '@duing/types';

import { successionRequestBadgeText } from '@/app/manage/clubs/[clubId]/members/_lib/successionRequestStatus';

// 처리 시각 + 14×24h(절대시각) = 2026-10-21T03:00:00Z. 고정 시각만 넘긴다 — 실제 시계와 무관.
const HANDLED_AT = '2026-10-07T03:00:00Z';
const FOURTEEN_DAYS_LATER = new Date('2026-10-21T03:00:00Z');
const ONE_MS_BEFORE_FOURTEEN_DAYS = new Date(FOURTEEN_DAYS_LATER.getTime() - 1);

function latestRequest(overrides: Partial<LatestLeaderSuccessionRequest>): LatestLeaderSuccessionRequest {
  return {
    requestId: 5,
    status: 'PENDING',
    reason: '회장이 두 달째 연락이 닿지 않습니다.',
    actionNote: null,
    createdAt: '2026-10-20T15:30:00Z',
    handledAt: null,
    ...overrides,
  };
}

describe('successionRequestBadgeText — 승계 요청 버튼이 보이는 임원', () => {
  it.each([
    ['APPROVED', '승인됨'],
    ['REJECTED', '거절됨'],
  ] as const)('%s 는 처리 후 14일 되기 1ms 전까지 "%s" 를 돌려준다', (status, label) => {
    expect(
      successionRequestBadgeText(latestRequest({ status, handledAt: HANDLED_AT }), ONE_MS_BEFORE_FOURTEEN_DAYS, true),
    ).toBe(label);
  });

  it.each(['APPROVED', 'REJECTED'] as const)('%s 는 정확히 14일이 되면 null 이다', (status) => {
    expect(
      successionRequestBadgeText(latestRequest({ status, handledAt: HANDLED_AT }), FOURTEEN_DAYS_LATER, true),
    ).toBeNull();
  });

  it('검토 대기 중은 기간과 무관하게 KST 제출일을 붙인다', () => {
    expect(successionRequestBadgeText(latestRequest({ status: 'PENDING' }), FOURTEEN_DAYS_LATER, true)).toBe(
      '검토 대기 중 · 2026.10.21 제출',
    );
  });
});

describe('successionRequestBadgeText — 버튼이 없는 회장(승인돼 회장이 된 요청자)', () => {
  it('승인 후 14일 미만이면 "승인됨" 만 돌려준다', () => {
    expect(
      successionRequestBadgeText(
        latestRequest({ status: 'APPROVED', handledAt: HANDLED_AT }),
        ONE_MS_BEFORE_FOURTEEN_DAYS,
        false,
      ),
    ).toBe('승인됨');
  });

  it('승인 후 정확히 14일이 되면 null 이다', () => {
    expect(
      successionRequestBadgeText(latestRequest({ status: 'APPROVED', handledAt: HANDLED_AT }), FOURTEEN_DAYS_LATER, false),
    ).toBeNull();
  });

  it.each([
    ['PENDING', null],
    ['REJECTED', HANDLED_AT],
  ] as const)('%s 는 배지를 붙일 버튼이 없어 null 이다', (status, handledAt) => {
    expect(
      successionRequestBadgeText(latestRequest({ status, handledAt }), ONE_MS_BEFORE_FOURTEEN_DAYS, false),
    ).toBeNull();
  });
});
