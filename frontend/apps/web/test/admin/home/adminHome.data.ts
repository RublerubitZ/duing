import type { AdminPendingCounts, AdminTriageAreaState, AdminTriageItem, AdminTriageQueue } from '@duing/types';

// KST 2026-10-29(목) 12:00 — 테스트는 vi.setSystemTime 으로 이 시각에 고정한다.
export const NOW_ISO = '2026-10-29T03:00:00.000Z';

export const PENDING_COUNTS: AdminPendingCounts = {
  clubApproval: 3,
  facilityBooking: 11,
  inquiryUnanswered: 5,
  promotionRequest: 2,
  reportUnresolved: 2,
  leaderSuccession: 1,
  stalePendingRecruitment: 4,
  totalPendingCount: 28,
};

export const readyArea = (oldestWaitingSince: string | null = null): AdminTriageAreaState => ({
  status: 'ready',
  rowCount: oldestWaitingSince === null ? 0 : 1,
  oldestWaitingSince,
});

export function triageQueue(overrides: Partial<AdminTriageQueue> = {}): AdminTriageQueue {
  return {
    items: [],
    areas: {
      REPORT: readyArea(),
      INQUIRY: readyArea(),
      FACILITY: readyArea(),
      RECRUITMENT: readyArea(),
      PROMOTION: readyArea(),
      SUCCESSION: readyArea(),
      CLUB_APPROVAL: readyArea(),
    },
    inquiryTotals: { received: 0, inProgress: 0 },
    isLoading: false,
    isError: false,
    clubApprovalTimeUnknown: false,
    ...overrides,
  };
}

export const REPORT_ITEM: AdminTriageItem = {
  area: 'REPORT', id: 1, waitingSince: '2026-10-20T03:00:00Z', targetType: 'CLUB', targetLabel: '아주 긴 이름의 중앙동아리 코드브루 2026학년도 정기 활동', reasonCode: 'SPAM',
};
export const PROMOTION_ITEM: AdminTriageItem = {
  area: 'PROMOTION', id: 5, waitingSince: '2026-10-28T03:00:00Z', clubName: '코드브루', title: '정기 공연 홍보',
};
export const CLUB_ITEM: AdminTriageItem = { area: 'CLUB_APPROVAL', id: 61, waitingSince: '2026-10-19T03:00:00Z', clubName: '새 동아리' };
