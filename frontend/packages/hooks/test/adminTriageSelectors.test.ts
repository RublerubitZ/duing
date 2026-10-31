import { describe, expect, it } from 'vitest';
import type {
  AdminClubSummary,
  AdminFacilityBookingSummary,
  AdminFederationInquirySummary,
  AdminPromotionRequestSummary,
  AdminRecruitmentListItem,
  AdminReportSummary,
  AdminSuccessionSummary,
  AdminTriageItem,
} from '@duing/types';
import {
  ADMIN_TRIAGE_QUEUE_LIMIT,
  facilityTriageItem,
  inquiryTriageItem,
  inactiveClubTriageItems,
  mergeTriageQueue,
  oldestTailPages,
  oldestWaitingSince,
  pendingClubTriageItems,
  promotionTriageItem,
  reportTriageItem,
  staleRecruitmentTriageItems,
  successionTriageItem,
} from '../src/adminTriageSelectors';

// KST 2026-10-29(목) 12:00
const NOW = new Date('2026-10-29T03:00:00.000Z');

const reportItem = (id: number, waitingSince: string): AdminTriageItem => ({
  area: 'REPORT', id, waitingSince, targetType: 'CLUB', targetLabel: '코드브루', reasonCode: 'SPAM',
});
const promotionItem = (id: number, waitingSince: string): AdminTriageItem => ({
  area: 'PROMOTION', id, waitingSince, clubName: '코드브루', title: '정기 공연 홍보',
});

const recruitment = (recruitmentId: number, overrides: Partial<AdminRecruitmentListItem>): AdminRecruitmentListItem => ({
  recruitmentId, clubId: 7, clubName: '코드브루', title: '2026 2학기 신입 모집', applicationMode: 'SELF',
  status: 'OPEN', displayStatus: 'OPEN', applicantCount: 5, startDate: '2026-10-01', endDate: '2026-11-30',
  closedAt: null, updatedAt: '2026-10-20T00:00:00Z', pendingApplicationCount: 3, oldestPendingSubmittedAt: null,
  operatorsLastActiveAt: null, ...overrides,
});

const pendingClub = (id: number, pendingSince: string | null | undefined): AdminClubSummary => ({
  id, name: `동아리 ${id}`, category: 'ACADEMIC', division: null, college: null, logoUrl: null,
  status: 'PENDING_APPROVAL', tags: [], leaderId: null, leaderName: null, leaderStudentId: null,
  centralClub: false, facilitySecuredTimeTarget: false, rejectionReason: null, statusChangedAt: null,
  statusChangedByName: null, ...(pendingSince === undefined ? {} : { pendingSince }),
});

describe('oldestTailPages — 최신순 목록에서 가장 오래된 10건이 든 페이지', () => {
  it.each([
    [100, 1, []],
    [101, 2, [1]],
    [109, 2, [1]],
    [110, 2, [1]],
    [200, 2, [1]],
    [201, 3, [1, 2]],
    [209, 3, [1, 2]],
    [210, 3, [2]],
    [305, 4, [2, 3]],
  ])('전체 %i건(%i쪽)이면 %j 쪽을 더 받는다', (totalElements, totalPages, expected) => {
    expect(oldestTailPages(totalElements, totalPages, 100)).toEqual(expected);
  });

  it('서버가 페이지를 더 작게 자르면 응답의 크기로 계산한다', () => {
    // 50건씩 잘린 205건 → 끝 페이지 4(5건) + 바로 앞 3
    expect(oldestTailPages(205, 5, 50)).toEqual([3, 4]);
  });
});

describe('목록 행 → 대기열 항목', () => {
  it('영역마다 식별자·대기 시작 시각·표시 원자료를 옮긴다', () => {
    const report: AdminReportSummary = { id: 1, targetType: 'RECRUITMENT', targetId: 9, targetLabel: '신입 모집', reasonCode: 'FRAUD', status: 'PENDING', createdAt: '2026-10-20T01:00:00Z' };
    const inquiry: AdminFederationInquirySummary = { id: 2, title: '동아리방 문의', status: 'IN_PROGRESS', authorName: '김두잉', authorStudentId: '20260001', createdAt: '2026-10-21T01:00:00Z', answeredAt: null };
    const booking: AdminFacilityBookingSummary = { bookingId: 3, clubId: 7, clubName: '', facilityId: 1, roomName: '학생회관 B103', date: '2026-11-04', startTime: '18:00:00', endTime: '20:00:00', status: 'CONFLICT', purpose: '정기 모임', createdAt: '2026-10-22T01:00:00Z', conflictSuspected: false, partiallyMatched: false };
    const promotion: AdminPromotionRequestSummary = { id: 4, club: { id: 7, name: '코드브루' }, requester: { id: 3, name: '이회장' }, title: '정기 공연 홍보', status: 'PENDING', createdAt: '2026-10-23T01:00:00Z' };
    const succession: AdminSuccessionSummary = { id: 5, clubId: 7, clubName: '코드브루', requester: { id: 3, name: '이회장' }, status: 'PENDING', createdAt: '2026-10-24T01:00:00Z' };

    expect(reportTriageItem(report)).toEqual({ area: 'REPORT', id: 1, waitingSince: '2026-10-20T01:00:00Z', targetType: 'RECRUITMENT', targetLabel: '신입 모집', reasonCode: 'FRAUD' });
    expect(inquiryTriageItem(inquiry)).toEqual({ area: 'INQUIRY', id: 2, waitingSince: '2026-10-21T01:00:00Z', title: '동아리방 문의', status: 'IN_PROGRESS' });
    expect(facilityTriageItem(booking)).toEqual({ area: 'FACILITY', id: 3, waitingSince: '2026-10-22T01:00:00Z', clubName: '', roomName: '학생회관 B103', date: '2026-11-04', startTime: '18:00:00', endTime: '20:00:00', status: 'CONFLICT' });
    expect(promotionTriageItem(promotion)).toEqual({ area: 'PROMOTION', id: 4, waitingSince: '2026-10-23T01:00:00Z', clubName: '코드브루', title: '정기 공연 홍보' });
    expect(successionTriageItem(succession)).toEqual({ area: 'SUCCESSION', id: 5, waitingSince: '2026-10-24T01:00:00Z', clubName: '코드브루', requesterName: '이회장' });
  });
});

describe('staleRecruitmentTriageItems — 서버 배지와 같은 168시간 경계', () => {
  it('미처리 지원서가 정확히 168시간 이상 기다린 진행 중 모집만 고른다', () => {
    const items = staleRecruitmentTriageItems(
      [
        recruitment(1, { oldestPendingSubmittedAt: '2026-10-22T03:00:00.000Z' }), // 정확히 168시간 → 포함
        recruitment(2, { oldestPendingSubmittedAt: '2026-10-22T03:00:00.001Z' }), // 1ms 모자람 → 제외
        recruitment(3, { oldestPendingSubmittedAt: null }),
        recruitment(4, { status: 'CLOSED', displayStatus: 'CLOSED', oldestPendingSubmittedAt: '2026-10-01T00:00:00Z' }),
        // KST 10/22 23:59 — 달력으로는 7일이지만 168시간이 안 됐다 → 제외
        recruitment(5, { oldestPendingSubmittedAt: '2026-10-22T14:59:00.000Z' }),
        // 기간은 끝났지만 raw OPEN — 아직 심사 기간이라 서버 배지와 같이 포함
        recruitment(6, { status: 'OPEN', displayStatus: 'CLOSED', oldestPendingSubmittedAt: '2026-10-01T00:00:00Z' }),
      ],
      NOW,
    );

    expect(items).toEqual([
      { area: 'RECRUITMENT', id: 1, waitingSince: '2026-10-22T03:00:00.000Z', clubName: '코드브루', title: '2026 2학기 신입 모집', pendingApplicationCount: 3 },
      { area: 'RECRUITMENT', id: 6, waitingSince: '2026-10-01T00:00:00Z', clubName: '코드브루', title: '2026 2학기 신입 모집', pendingApplicationCount: 3 },
    ]);
  });
});

describe('mergeTriageQueue', () => {
  it('오래 기다린 순 → 같은 시각이면 영역 순서(신고 먼저) → 식별자 순으로 정렬한다', () => {
    const merged = mergeTriageQueue([
      promotionItem(1, '2026-10-20T00:00:00Z'),
      reportItem(9, '2026-10-20T00:00:00Z'),
      reportItem(3, '2026-10-20T00:00:00Z'),
      promotionItem(2, '2026-10-10T00:00:00Z'),
    ]);
    expect(merged.map((item) => `${item.area}:${item.id}`)).toEqual(['PROMOTION:2', 'REPORT:3', 'REPORT:9', 'PROMOTION:1']);
  });

  it('오프셋 없는 시각은 KST 로 보고 비교한다', () => {
    const facility: AdminTriageItem = {
      area: 'FACILITY', id: 5, waitingSince: '2026-10-20T08:00:00', clubName: '코드브루', roomName: '학생회관 B103',
      date: '2026-11-04', startTime: '18:00:00', endTime: '20:00:00', status: 'PENDING',
    };
    // 2026-10-20T08:00:00(KST) = 2026-10-19T23:00:00Z — 2026-10-19T23:30:00Z 보다 이르다
    const merged = mergeTriageQueue([promotionItem(1, '2026-10-19T23:30:00Z'), facility]);
    expect(merged.map((item) => `${item.area}:${item.id}`)).toEqual(['FACILITY:5', 'PROMOTION:1']);
  });

  it('같은 영역·식별자는 한 번만 남기고, 영역이 다르면 식별자가 같아도 따로 둔다', () => {
    const merged = mergeTriageQueue([
      reportItem(1, '2026-10-20T00:00:00Z'),
      reportItem(1, '2026-10-20T00:00:00Z'),
      promotionItem(1, '2026-10-21T00:00:00Z'),
    ]);
    expect(merged.map((item) => `${item.area}:${item.id}`)).toEqual(['REPORT:1', 'PROMOTION:1']);
  });

  it(`가장 오래된 ${ADMIN_TRIAGE_QUEUE_LIMIT}건까지만 남긴다`, () => {
    const items = Array.from({ length: 12 }, (_, index) => reportItem(index + 1, `2026-10-${String(10 + index).padStart(2, '0')}T00:00:00Z`));
    const merged = mergeTriageQueue(items.slice().reverse());
    expect(merged).toHaveLength(ADMIN_TRIAGE_QUEUE_LIMIT);
    expect(merged.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('빈 목록이면 빈 배열', () => {
    expect(mergeTriageQueue([])).toEqual([]);
  });
});

describe('oldestWaitingSince', () => {
  it('가장 이른 대기 시작 시각을 원래 문자열 그대로 돌려주고, 행이 없으면 null', () => {
    expect(oldestWaitingSince([reportItem(1, '2026-10-21T00:00:00Z'), promotionItem(2, '2026-10-19T00:00:00Z')])).toBe('2026-10-19T00:00:00Z');
    expect(oldestWaitingSince([])).toBeNull();
  });
});

describe('pendingClubTriageItems — 승인 대기 동아리', () => {
  it('승인 대기 시작 시각이 있는 동아리만 대기열 항목으로 옮긴다', () => {
    expect(pendingClubTriageItems([pendingClub(61, '2026-10-20T01:00:00Z'), pendingClub(62, null), pendingClub(63, undefined)])).toEqual([
      { area: 'CLUB_APPROVAL', id: 61, waitingSince: '2026-10-20T01:00:00Z', clubName: '동아리 61' },
    ]);
  });
});

describe('mergeTriageQueue — 동아리 승인', () => {
  it('같은 시각이면 동아리 승인은 회장 승계보다도 뒤다', () => {
    const club: AdminTriageItem = { area: 'CLUB_APPROVAL', id: 1, waitingSince: '2026-10-20T00:00:00Z', clubName: '코드브루' };
    const succession: AdminTriageItem = { area: 'SUCCESSION', id: 9, waitingSince: '2026-10-20T00:00:00Z', clubName: '코드브루', requesterName: '이회장' };
    expect(mergeTriageQueue([club, succession]).map((item) => item.area)).toEqual(['SUCCESSION', 'CLUB_APPROVAL']);
  });
});

const inactiveClub = (
  id: number,
  statusChangedAt: string | null,
  counts: Pick<AdminClubSummary, 'undecidedApplicationCount' | 'pendingJoinRequestCount'>,
): AdminClubSummary => ({
  id, name: `쉬는 동아리 ${id}`, category: 'ACADEMIC', division: null, college: null, logoUrl: null,
  status: 'INACTIVE', tags: [], leaderId: null, leaderName: null, leaderStudentId: null,
  centralClub: false, facilitySecuredTimeTarget: false, rejectionReason: null, statusChangedAt,
  statusChangedByName: '총동연관리자', ...counts,
});

describe('inactiveClubTriageItems — 운영 중단 미결', () => {
  it('두 건수가 숫자이고 합이 1 이상이며 운영 중단 시각이 있는 동아리만 옮긴다 — 부재는 옛 백엔드라 넣지 않는다', () => {
    expect(
      inactiveClubTriageItems([
        inactiveClub(81, '2026-10-26T03:00:00Z', { undecidedApplicationCount: 3, pendingJoinRequestCount: 1 }),
        inactiveClub(82, '2026-10-26T03:00:00Z', { undecidedApplicationCount: 0, pendingJoinRequestCount: 0 }),
        inactiveClub(83, '2026-10-26T03:00:00Z', {}),
        inactiveClub(84, '2026-10-26T03:00:00Z', { undecidedApplicationCount: null, pendingJoinRequestCount: null }),
        inactiveClub(85, null, { undecidedApplicationCount: 1, pendingJoinRequestCount: 0 }),
        inactiveClub(86, '2026-10-26T03:00:00Z', { undecidedApplicationCount: 2 }),
      ]),
    ).toEqual([
      {
        area: 'INACTIVE_CLUB', id: 81, waitingSince: '2026-10-26T03:00:00Z', clubName: '쉬는 동아리 81',
        undecidedApplicationCount: 3, pendingJoinRequestCount: 1,
      },
    ]);
  });
});

describe('mergeTriageQueue — 운영 중단 미결', () => {
  it('같은 시각이면 운영 중단 미결은 동아리 승인보다도 뒤(맨 끝)다', () => {
    const inactive: AdminTriageItem = {
      area: 'INACTIVE_CLUB', id: 1, waitingSince: '2026-10-20T00:00:00Z', clubName: '쉬는 동아리',
      undecidedApplicationCount: 1, pendingJoinRequestCount: 0,
    };
    const approval: AdminTriageItem = { area: 'CLUB_APPROVAL', id: 9, waitingSince: '2026-10-20T00:00:00Z', clubName: '새 동아리' };
    expect(mergeTriageQueue([inactive, approval]).map((item) => item.area)).toEqual(['CLUB_APPROVAL', 'INACTIVE_CLUB']);
  });
});
