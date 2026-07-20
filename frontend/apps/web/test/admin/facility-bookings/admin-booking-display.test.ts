import { describe, expect, it } from 'vitest';
import {
  buildSlotStrip,
  conflictCardCount,
  crawlFreshnessLabel,
  isFacilityBookingConflictPayload,
  requestAgeLabel,
} from '@/app/admin/facility-bookings/_lib/adminBookingDisplay';

describe('crawlFreshnessLabel', () => {
  it('기준 시각 대비 경과 분/시간을 라벨링하고, 없으면 안내 문구를 준다', () => {
    // 무오프셋 입력은 KST 벽시계로 해석되므로 now 도 절대시각으로 고정한다(브라우저 존 무관 결정성).
    const now = new Date('2026-07-13T12:00:00+09:00');
    expect(crawlFreshnessLabel('2026-07-13T11:45:00', now)).toBe('마지막 수집 15분 전');
    expect(crawlFreshnessLabel('2026-07-13T09:00:00', now)).toBe('마지막 수집 3시간 전');
    // 정규화된 Event Time(`…Z`) 입력도 같은 절대시각으로 흡수된다.
    expect(crawlFreshnessLabel('2026-07-13T02:45:00Z', now)).toBe('마지막 수집 15분 전');
    expect(crawlFreshnessLabel(undefined, now)).toBe('수집 정보 없음');
  });
});

describe('requestAgeLabel', () => {
  it('24시간 단위 floor 로 경과 일수를 라벨링하고, 당일은 오늘 접수로 표기한다', () => {
    const now = new Date('2026-07-13T12:00:00+09:00');
    expect(requestAgeLabel('2026-07-13T09:00:00', now)).toBe('오늘 접수');
    expect(requestAgeLabel('2026-07-11T09:00:00', now)).toBe('2일 경과');
    // 미래 시각(서버 시계 편차)은 음수 대신 오늘 접수로 흡수, Invalid 는 빈 문자열.
    expect(requestAgeLabel('2026-07-14T09:00:00', now)).toBe('오늘 접수');
    expect(requestAgeLabel('not-a-date', now)).toBe('');
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
    expect(cells[9]).toEqual({ hour: 18, inRequest: true, overlapSource: 'SCHOOL', overlapOrganization: '문화팀' }); // 18시 칸
    expect(cells[10]).toEqual({ hour: 19, inRequest: true, overlapSource: null, overlapOrganization: null });
    // organization 빈 문자열(PENDING 겹침)은 표기할 이름이 없으므로 null 로 정규화된다.
    expect(cells[11]).toEqual({ hour: 20, inRequest: false, overlapSource: 'PENDING', overlapOrganization: null });
    expect(cells[0]).toEqual({ hour: 9, inRequest: false, overlapSource: null, overlapOrganization: null });
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
