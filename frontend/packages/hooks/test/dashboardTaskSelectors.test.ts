import { describe, it, expect } from 'vitest';
import type {
  ActionItem,
  FacilityBookingSummary,
  FeeBillSummary,
  JoinRequestSummary,
  OperationItem,
} from '@duing/types';
import {
  buildOperationItems,
  dashboardTaskGroupOf,
  groupDashboardTasks,
  selectAttentionBookings,
} from '../src/dashboardSelectors';

// 2026-10-28 00:30 KST = 2026-10-27 15:30 UTC — UTC 날짜를 쓰면 하루 어긋나는 자리.
const JUST_AFTER_KST_MIDNIGHT = new Date('2026-10-27T15:30:00Z');

function booking(over: Partial<FacilityBookingSummary> = {}): FacilityBookingSummary {
  return {
    bookingId: 1, facilityId: 1, roomName: '학생회관 B103', date: '2026-10-28',
    startTime: '18:00:00', endTime: '20:00:00', status: 'REJECTED', purpose: '정기 합주',
    createdAt: '2026-10-20T10:00:00', ...over,
  };
}

function feeSummary(over: Partial<FeeBillSummary> = {}): FeeBillSummary {
  return {
    totalBilled: 0, totalPaid: 0, outstanding: 0, collectionRate: 0, billCount: 0,
    pendingCount: 0, partialPaidCount: 0, overdueCount: 0, paidCount: 0, ...over,
  };
}

function joinRequest(over: Partial<JoinRequestSummary> = {}): JoinRequestSummary {
  return {
    joinRequestId: 1, userName: '한지민', studentId: '20261234', major: '경영학과', code: 'ABC',
    generation: null, status: 'PENDING', requestedAt: '2026-10-26T01:00:00Z', autoApproved: false, ...over,
  };
}

const emptyInput = { pendingJoinRequests: undefined, feeSummary: undefined, bankPendingCount: undefined, bookings: undefined };

describe('selectAttentionBookings', () => {
  it('KST 자정 직후에도 오늘 예약은 남기고 어제 예약은 뺀다', () => {
    const items = selectAttentionBookings(
      [booking({ bookingId: 1, date: '2026-10-28' }), booking({ bookingId: 2, date: '2026-10-27' })],
      JUST_AFTER_KST_MIDNIGHT,
    );
    expect(items.map((item) => (item.type === 'FACILITY_BOOKING_ATTENTION' ? item.bookingId : null))).toEqual([1]);
  });

  it('거절·충돌만 남기고 대기·승인·확정·취소는 뺀다', () => {
    const items = selectAttentionBookings(
      [
        booking({ bookingId: 1, status: 'REJECTED' }),
        booking({ bookingId: 2, status: 'CONFLICT' }),
        booking({ bookingId: 3, status: 'PENDING' }),
        booking({ bookingId: 4, status: 'APPROVED' }),
        booking({ bookingId: 5, status: 'CONFIRMED' }),
        booking({ bookingId: 6, status: 'CANCELLED' }),
      ],
      JUST_AFTER_KST_MIDNIGHT,
    );
    expect(items).toHaveLength(2);
  });
});

describe('buildOperationItems', () => {
  it('출처가 비어 있으면 항목이 없다', () => {
    expect(buildOperationItems(emptyInput, JUST_AFTER_KST_MIDNIGHT)).toEqual([]);
  });

  it('가입 요청은 건수와 가장 이른 요청 시각을 담는다', () => {
    const items = buildOperationItems(
      {
        ...emptyInput,
        pendingJoinRequests: [
          joinRequest({ joinRequestId: 1, requestedAt: '2026-10-27T01:00:00Z' }),
          joinRequest({ joinRequestId: 2, requestedAt: '2026-10-25T01:00:00Z' }),
          joinRequest({ joinRequestId: 3, requestedAt: '2026-10-26T01:00:00Z' }),
        ],
      },
      JUST_AFTER_KST_MIDNIGHT,
    );
    expect(items).toEqual([{ type: 'JOIN_REQUESTS_PENDING', count: 3, oldestRequestedAt: '2026-10-25T01:00:00Z' }]);
  });

  it('연체가 0이면 회비 항목이 없고, 1 이상이면 청구 건수를 담는다', () => {
    expect(buildOperationItems({ ...emptyInput, feeSummary: feeSummary({ overdueCount: 0 }) }, JUST_AFTER_KST_MIDNIGHT)).toEqual([]);
    expect(buildOperationItems({ ...emptyInput, feeSummary: feeSummary({ overdueCount: 4 }) }, JUST_AFTER_KST_MIDNIGHT)).toEqual([
      { type: 'FEE_OVERDUE', count: 4 },
    ]);
  });

  it('은행 검토 대기가 0이면 항목이 없다', () => {
    expect(buildOperationItems({ ...emptyInput, bankPendingCount: 0 }, JUST_AFTER_KST_MIDNIGHT)).toEqual([]);
    expect(buildOperationItems({ ...emptyInput, bankPendingCount: 2 }, JUST_AFTER_KST_MIDNIGHT)).toEqual([
      { type: 'BANK_REVIEW_PENDING', count: 2 },
    ]);
  });
});

const recruitmentItem = (over: Partial<ActionItem> & Pick<ActionItem, 'type'>): ActionItem => ({
  recruitmentId: 1, recruitmentTitle: '신입 부원 모집', ...over,
});

describe('dashboardTaskGroupOf', () => {
  it.each([
    ['CLOSED_RECRUITMENT_UNDECIDED', 'NOW'],
    ['INTERVIEW_RESULT_PENDING', 'NOW'],
    ['INTERVIEW_ROUND_UNCONFIRMED', 'NOW'],
    ['APPLICANTS_AWAITING_REVIEW', 'WAITING'],
    ['INTERVIEW_ROUND_NEEDED', 'WAITING'],
  ] as const)('모집 업무 %s → %s', (type, group) => {
    expect(dashboardTaskGroupOf({ source: 'RECRUITMENT', item: recruitmentItem({ type }) })).toBe(group);
  });

  it('면접 응답 미수집은 응답 마감이 지났을 때만 지금 처리', () => {
    const task = (daysLeft: number | undefined) => ({
      source: 'RECRUITMENT' as const,
      item: recruitmentItem({ type: 'INTERVIEW_RESPONSE_UNCOLLECTED', daysLeft }),
    });
    expect(dashboardTaskGroupOf(task(-1))).toBe('NOW');
    expect(dashboardTaskGroupOf(task(0))).toBe('WAITING');
    expect(dashboardTaskGroupOf(task(undefined))).toBe('WAITING');
  });

  it('운영 업무: 회비 연체는 지금 처리, 시설은 확인만, 나머지는 처리 대기', () => {
    const operation = (item: OperationItem) => dashboardTaskGroupOf({ source: 'OPERATION', item });
    expect(operation({ type: 'FEE_OVERDUE', count: 1 })).toBe('NOW');
    expect(operation({ type: 'JOIN_REQUESTS_PENDING', count: 1, oldestRequestedAt: '2026-10-26T01:00:00Z' })).toBe('WAITING');
    expect(operation({ type: 'BANK_REVIEW_PENDING', count: 1 })).toBe('WAITING');
    expect(
      operation({ type: 'FACILITY_BOOKING_ATTENTION', bookingId: 1, roomName: 'A', date: '2026-10-28', startTime: '18:00:00', endTime: '20:00:00', status: 'REJECTED' }),
    ).toBe('INFO');
  });
});

describe('groupDashboardTasks', () => {
  it('빈 묶음은 빼고 지금 처리 → 처리 대기 → 확인만 순서로 낸다', () => {
    const groups = groupDashboardTasks(
      [recruitmentItem({ type: 'APPLICANTS_AWAITING_REVIEW', count: 3 })],
      [{ type: 'FEE_OVERDUE', count: 2 }],
    );
    expect(groups.map((group) => group.key)).toEqual(['NOW', 'WAITING']);
  });

  it('묶음 안에서 기한 있는 항목이 먼저, 그다음 종류 우선순위(모집 6종 → 회비 → 가입 → 은행 → 시설)', () => {
    const groups = groupDashboardTasks(
      [
        recruitmentItem({ type: 'APPLICANTS_AWAITING_REVIEW', count: 3 }),
        recruitmentItem({ type: 'INTERVIEW_RESPONSE_UNCOLLECTED', roundId: 7, daysLeft: 2 }),
        recruitmentItem({ type: 'INTERVIEW_ROUND_NEEDED', count: 1 }),
      ],
      [
        { type: 'BANK_REVIEW_PENDING', count: 1 },
        { type: 'JOIN_REQUESTS_PENDING', count: 1, oldestRequestedAt: '2026-10-26T01:00:00Z' },
      ],
    );
    const waiting = groups.find((group) => group.key === 'WAITING');
    expect(waiting?.tasks.map((task) => task.item.type)).toEqual([
      'INTERVIEW_RESPONSE_UNCOLLECTED',
      'INTERVIEW_ROUND_NEEDED',
      'APPLICANTS_AWAITING_REVIEW',
      'JOIN_REQUESTS_PENDING',
      'BANK_REVIEW_PENDING',
    ]);
  });

  it('시설끼리는 예약일 → 시작 시각 → bookingId 순', () => {
    const facility = (bookingId: number, date: string, startTime: string): OperationItem => ({
      type: 'FACILITY_BOOKING_ATTENTION', bookingId, roomName: 'A', date, startTime, endTime: '23:00:00', status: 'REJECTED',
    });
    const groups = groupDashboardTasks([], [
      facility(3, '2026-11-04', '18:00:00'),
      facility(2, '2026-11-04', '18:00:00'),
      facility(1, '2026-11-05', '09:00:00'),
      facility(4, '2026-11-04', '10:00:00'),
    ]);
    expect(groups[0]?.tasks.map((task) => (task.item.type === 'FACILITY_BOOKING_ATTENTION' ? task.item.bookingId : null))).toEqual([4, 2, 3, 1]);
  });
});
