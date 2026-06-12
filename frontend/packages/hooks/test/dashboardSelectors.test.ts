import { describe, it, expect } from 'vitest';
import type {
  RecruitmentSummary,
  StatsSummary,
  InterviewRoundSummary,
  TodayScheduleItem,
} from '@duing/types';
import {
  CLOSING_SOON_DAYS,
  ACTION_ITEM_PREVIEW_COUNT,
  buildActionItems,
  sortActionItems,
  aggregateApplicantTotals,
  sortTodaySchedule,
  type RecruitmentDashboardInput,
} from '../src/dashboardSelectors';

const NOW = new Date('2026-06-12T03:00:00Z'); // 6/12 KST 12:00

function recruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: 1, clubId: 10, clubName: '두잉', title: '2026 봄 모집',
    startDate: '2026-06-01', endDate: '2026-06-30', capacity: 20,
    status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
    applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: true,
    targetRole: 'MEMBER', ...over,
  } as RecruitmentSummary;
}

function stats(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    total: 0, submitted: 0, underReview: 0, interviewPending: 0,
    accepted: 0, rejected: 0, capacity: 20, ratio: 0, ...over,
  };
}

function round(over: Partial<InterviewRoundSummary> = {}): InterviewRoundSummary {
  return {
    roundId: 100, title: '1차 면접', status: 'DRAFT',
    availabilityDeadline: null, location: null,
    totalMemberCount: 0, respondedMemberCount: 0, ...over,
  };
}

describe('buildActionItems', () => {
  it('검토 대기 지원자(submitted+underReview>0)를 만든다', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment(), stats: stats({ submitted: 2, underReview: 3 }), rounds: [] },
    ];
    const items = buildActionItems(input, NOW);
    const review = items.find((i) => i.type === 'APPLICANTS_AWAITING_REVIEW');
    expect(review).toBeDefined();
    expect(review?.count).toBe(5);
    expect(review?.recruitmentId).toBe(1);
  });

  it('ASSIGNING 라운드 → 미확정 면접 라운드', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment(), stats: stats(), rounds: [round({ roundId: 7, status: 'ASSIGNING', title: '2차' })] },
    ];
    const items = buildActionItems(input, NOW);
    const unconfirmed = items.find((i) => i.type === 'INTERVIEW_ROUND_UNCONFIRMED');
    expect(unconfirmed?.roundId).toBe(7);
    expect(unconfirmed?.roundTitle).toBe('2차');
  });

  it('COLLECTING & 미응답 인원 존재 → 응답 미수집', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment(), stats: stats(),
        rounds: [round({ status: 'COLLECTING', totalMemberCount: 10, respondedMemberCount: 4, availabilityDeadline: '2026-06-10' })] },
    ];
    const items = buildActionItems(input, NOW);
    const uncollected = items.find((i) => i.type === 'INTERVIEW_RESPONSE_UNCOLLECTED');
    expect(uncollected?.count).toBe(6); // 미응답 10-4
    expect(uncollected?.daysLeft).toBe(-2); // 6/10 마감 → 경과
  });

  it('SCHEDULED 라운드 + interviewPending>0 → 결과 미확정', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment(), stats: stats({ interviewPending: 4 }),
        rounds: [round({ status: 'SCHEDULED' })] },
    ];
    const items = buildActionItems(input, NOW);
    const pending = items.find((i) => i.type === 'INTERVIEW_RESULT_PENDING');
    expect(pending?.count).toBe(4);
  });

  it('endDate가 D-3 이내면 마감 임박', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment({ endDate: '2026-06-14' }), stats: stats(), rounds: [] },
    ];
    const items = buildActionItems(input, NOW);
    const closing = items.find((i) => i.type === 'RECRUITMENT_CLOSING_SOON');
    expect(closing?.daysLeft).toBe(2);
  });

  it('endDate가 D-3 초과면 마감 임박 아님', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment({ endDate: '2026-06-30' }), stats: stats(), rounds: [] },
    ];
    expect(buildActionItems(input, NOW).some((i) => i.type === 'RECRUITMENT_CLOSING_SOON')).toBe(false);
  });

  it('CLOSED 모집은 마감 임박을 만들지 않는다', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment({ displayStatus: 'CLOSED', endDate: '2026-06-14' }), stats: stats(), rounds: [] },
    ];
    expect(buildActionItems(input, NOW).some((i) => i.type === 'RECRUITMENT_CLOSING_SOON')).toBe(false);
  });
});

describe('sortActionItems', () => {
  it('기한 있는 항목이 daysLeft 오름차순으로 먼저, 그 뒤 타입 우선순위', () => {
    const items = buildActionItems(
      [
        { recruitment: recruitment({ id: 1, endDate: '2026-06-14' }), stats: stats({ submitted: 1 }),
          rounds: [round({ roundId: 9, status: 'ASSIGNING' })] },
      ],
      NOW,
    );
    const sorted = sortActionItems(items);
    // 마감 임박(daysLeft=2) → 기한 없는 ASSIGNING → 검토 대기 순
    expect(sorted[0]?.type).toBe('RECRUITMENT_CLOSING_SOON');
    expect(sorted[1]?.type).toBe('INTERVIEW_ROUND_UNCONFIRMED');
    expect(sorted[2]?.type).toBe('APPLICANTS_AWAITING_REVIEW');
  });
});

describe('aggregateApplicantTotals', () => {
  it('여러 모집 통계를 합산한다(undefined 무시)', () => {
    const totals = aggregateApplicantTotals([
      stats({ total: 5, submitted: 2, accepted: 1, capacity: 20 }),
      undefined,
      stats({ total: 3, submitted: 1, interviewPending: 2, capacity: 10 }),
    ]);
    expect(totals.total).toBe(8);
    expect(totals.submitted).toBe(3);
    expect(totals.interviewPending).toBe(2);
    expect(totals.capacity).toBe(30);
  });
});

describe('sortTodaySchedule', () => {
  it('시간 오름차순, 동일 시간은 면접 우선', () => {
    const event = (h: number): TodayScheduleItem => ({
      kind: 'EVENT', title: `행사${h}`, startAt: `2026-06-12T${String(h).padStart(2, '0')}:00:00+09:00`,
      endAt: null, location: null,
    });
    const interview = (h: number): TodayScheduleItem => ({
      kind: 'INTERVIEW', title: `면접${h}`, startAt: `2026-06-12T${String(h).padStart(2, '0')}:00:00+09:00`,
      endAt: null, location: null, recruitmentId: 1, roundId: 2,
    });
    const sorted = sortTodaySchedule([event(10), interview(10), event(9)]);
    expect(sorted.map((i) => i.title)).toEqual(['행사9', '면접10', '행사10']);
  });
});

describe('constants', () => {
  it('상수 노출', () => {
    expect(CLOSING_SOON_DAYS).toBe(3);
    expect(ACTION_ITEM_PREVIEW_COUNT).toBe(3);
  });
});
