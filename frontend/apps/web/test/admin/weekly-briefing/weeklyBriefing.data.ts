import type { AdminWeeklyBriefing } from '@duing/types';

/** KST 2026-11-05(목) 14:05 — 이번 주는 11/2(월) 주, 가장 최근에 끝난 주는 10/26(월) 주. vi.setSystemTime 으로 고정한다. */
export const NOW_ISO = '2026-11-05T05:05:00.000Z';

/** 스펙 §3-3·§3-4 의 예시 숫자(10/26 주). */
export function weeklyBriefingOf(overrides: Partial<AdminWeeklyBriefing> = {}): AdminWeeklyBriefing {
  return {
    flow: {
      report: { receivedCount: 4, handledCount: 2 },
      inquiry: { receivedCount: 9, handledCount: 4 },
      facilityBooking: { receivedCount: 14, handledCount: 12 },
      promotionRequest: { receivedCount: 2, handledCount: 1 },
      leaderSuccession: { receivedCount: 1, handledCount: 1 },
    },
    endPending: {
      clubApproval: 3,
      facilityBooking: 11,
      inquiryUnanswered: 5,
      promotionRequest: 2,
      reportUnresolved: 3,
      leaderSuccession: 1,
      stalePendingRecruitment: 2,
      inactiveClubPending: 1,
      totalPendingCount: 28,
    },
    pendingRecordStartedOn: '2026-09-01',
    inquiryFirstAnswer: { answerCount: 4, averageMinutes: 2580 },
    federationNoticeCount: 1,
    recruitment: { createdCount: 3, endedCount: 2, applicationCount: 142 },
    fee: { billCount: 120, billedClubCount: 8, paymentCount: 95, voidedPaymentCount: 2, accountChangedClubCount: 1 },
    profileCheckConfirmedCount: 37,
    ...overrides,
  };
}

export const OCTOBER_26 = weeklyBriefingOf();

/** 전 주(10/19) — 남은 대기 합계 22(→ +6), 지원서 122(→ +20), 총동연 공지 9. */
export const OCTOBER_19 = weeklyBriefingOf({
  flow: {
    report: { receivedCount: 3, handledCount: 3 },
    inquiry: { receivedCount: 4, handledCount: 4 },
    facilityBooking: { receivedCount: 10, handledCount: 10 },
    promotionRequest: { receivedCount: 2, handledCount: 2 },
    leaderSuccession: { receivedCount: 2, handledCount: 2 },
  },
  endPending: {
    clubApproval: 3,
    facilityBooking: 9,
    inquiryUnanswered: 0,
    promotionRequest: 2,
    reportUnresolved: 2,
    leaderSuccession: 2,
    stalePendingRecruitment: 3,
    inactiveClubPending: 1,
    totalPendingCount: 22,
  },
  federationNoticeCount: 9,
  recruitment: { createdCount: 1, endedCount: 1, applicationCount: 122 },
});

const ZERO_FLOW = { receivedCount: 0, handledCount: 0 };
/** 조용한 주 — 다섯 업무 0·새 모집 0·지원서 0(기간 끝난 모집 1 은 0 판정에 들지 않는다). */
export const QUIET_WEEK = weeklyBriefingOf({
  flow: { report: ZERO_FLOW, inquiry: ZERO_FLOW, facilityBooking: ZERO_FLOW, promotionRequest: ZERO_FLOW, leaderSuccession: ZERO_FLOW },
  inquiryFirstAnswer: { answerCount: 0, averageMinutes: null },
  recruitment: { createdCount: 0, endedCount: 1, applicationCount: 0 },
});
