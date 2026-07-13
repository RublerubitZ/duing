import { describe, expect, it } from 'vitest';
import {
  buildSlotStrip,
  conflictCardCount,
  crawlFreshnessLabel,
  isFacilityBookingConflictPayload,
} from '@/app/admin/facility-bookings/_lib/adminBookingDisplay';

describe('crawlFreshnessLabel', () => {
  it('기준 시각 대비 경과 분/시간을 라벨링하고, 없으면 안내 문구를 준다', () => {
    const now = new Date(2026, 6, 13, 12, 0, 0);
    expect(crawlFreshnessLabel('2026-07-13T11:45:00', now)).toBe('마지막 수집 15분 전');
    expect(crawlFreshnessLabel('2026-07-13T09:00:00', now)).toBe('마지막 수집 3시간 전');
    expect(crawlFreshnessLabel(undefined, now)).toBe('수집 정보 없음');
  });
});

describe('isFacilityBookingConflictPayload', () => {
  it('§8.3 payload 형태만 통과시킨다', () => {
    expect(
      isFacilityBookingConflictPayload({
        conflicts: [{ source: 'SCHOOL', organization: '문화팀', start: '18:00', end: '19:00' }],
        crawlBasisAt: '2026-07-13T11:20:00+09:00',
      }),
    ).toBe(true);
    expect(isFacilityBookingConflictPayload({ conflicts: [], crawlBasisAt: null })).toBe(true);
    expect(isFacilityBookingConflictPayload(null)).toBe(false);
    expect(isFacilityBookingConflictPayload({ conflicts: 'x' })).toBe(false);
    expect(isFacilityBookingConflictPayload({ conflicts: [{ organization: 1 }] })).toBe(false);
  });
});

describe('buildSlotStrip', () => {
  it('신청 구간·점유행·겹치는 항목을 13칸에 매핑한다', () => {
    const cells = buildSlotStrip({
      startTime: '18:00',
      endTime: '20:00',
      overlaps: [
        { source: 'SCHOOL', organization: '문화팀', startTime: '18:00', endTime: '19:00' },
        { source: 'PENDING', organization: '', startTime: '20:00', endTime: '21:00' },
      ],
    });
    expect(cells).toHaveLength(13);
    expect(cells[9]).toEqual({ hour: 18, inRequest: true, overlapSource: 'SCHOOL' }); // 18시 칸
    expect(cells[10]).toEqual({ hour: 19, inRequest: true, overlapSource: null });
    expect(cells[11]).toEqual({ hour: 20, inRequest: false, overlapSource: 'PENDING' });
    expect(cells[0]).toEqual({ hour: 9, inRequest: false, overlapSource: null });
  });
});

describe('conflictCardCount', () => {
  it('CONFLICT 건수와 충돌 의심 건수를 합산한다(§9.7)', () => {
    expect(
      conflictCardCount({
        pendingCount: 0, todaySubmittedCount: 0, oldestPendingWaitingDays: 0,
        approvedWaitingCount: 0, oldestApprovedWaitingDays: 0,
        conflictCount: 2, conflictSuspectedCount: 3, confirmedThisMonthCount: 0,
      }),
    ).toBe(5);
  });
});
