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
    applicationMode: 'SELF', externalFormUrl: null, useInterview: true,
    targetRole: 'MEMBER', ...over,
  };
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

function dashboardInput(over: Partial<RecruitmentDashboardInput> = {}): RecruitmentDashboardInput {
  return { recruitment: recruitment(), stats: stats(), rounds: [], candidateCount: undefined, ...over };
}

describe('buildActionItems', () => {
  it('검토 대기 지원자(submitted+underReview>0)를 만든다', () => {
    const input: RecruitmentDashboardInput[] = [
      dashboardInput({ stats: stats({ submitted: 2, underReview: 3 }) }),
    ];
    const items = buildActionItems(input, NOW);
    const review = items.find((i) => i.type === 'APPLICANTS_AWAITING_REVIEW');
    expect(review).toBeDefined();
    expect(review?.count).toBe(5);
    expect(review?.recruitmentId).toBe(1);
  });

  it('ASSIGNING 라운드 → 미확정 면접 라운드', () => {
    const input: RecruitmentDashboardInput[] = [
      dashboardInput({ rounds: [round({ roundId: 7, status: 'ASSIGNING', title: '2차' })] }),
    ];
    const items = buildActionItems(input, NOW);
    const unconfirmed = items.find((i) => i.type === 'INTERVIEW_ROUND_UNCONFIRMED');
    expect(unconfirmed?.roundId).toBe(7);
    expect(unconfirmed?.roundTitle).toBe('2차');
  });

  it('COLLECTING & 미응답 인원 존재 → 응답 미수집', () => {
    const input: RecruitmentDashboardInput[] = [
      dashboardInput({
        rounds: [round({ status: 'COLLECTING', totalMemberCount: 10, respondedMemberCount: 4, availabilityDeadline: '2026-06-10' })],
      }),
    ];
    const items = buildActionItems(input, NOW);
    const uncollected = items.find((i) => i.type === 'INTERVIEW_RESPONSE_UNCOLLECTED');
    expect(uncollected?.count).toBe(6); // 미응답 10-4
    expect(uncollected?.daysLeft).toBe(-2); // 6/10 마감 → 경과
  });

  it('SCHEDULED 라운드 + 배정 인원(interviewPending-대기열) 존재 → 결과 미확정, 단일 라운드 귀속', () => {
    const input: RecruitmentDashboardInput[] = [
      dashboardInput({
        stats: stats({ interviewPending: 4 }),
        candidateCount: 0,
        rounds: [round({ roundId: 7, title: '1차 면접', status: 'SCHEDULED' })],
      }),
    ];
    const items = buildActionItems(input, NOW);
    const pending = items.find((i) => i.type === 'INTERVIEW_RESULT_PENDING');
    expect(pending?.count).toBe(4);
    expect(pending?.roundId).toBe(7);
    expect(pending?.roundTitle).toBe('1차 면접');
  });

  it('interviewPending 전원이 대기열이면(배정 인원 0) 결과 미확정 아님', () => {
    const items = buildActionItems(
      [dashboardInput({ stats: stats({ interviewPending: 4 }), candidateCount: 4, rounds: [round({ status: 'SCHEDULED' })] })],
      NOW,
    );
    expect(items.some((i) => i.type === 'INTERVIEW_RESULT_PENDING')).toBe(false);
  });

  it('대기열 인원을 뺀 배정 인원만 센다 — count = interviewPending - candidateCount', () => {
    const items = buildActionItems(
      [
        dashboardInput({
          stats: stats({ interviewPending: 4 }),
          candidateCount: 1,
          rounds: [round({ roundId: 7, title: '1차 면접', status: 'SCHEDULED' })],
        }),
      ],
      NOW,
    );
    const pending = items.find((i) => i.type === 'INTERVIEW_RESULT_PENDING');
    expect(pending?.count).toBe(3);
    expect(pending?.roundId).toBe(7);
    expect(pending?.roundTitle).toBe('1차 면접');
  });

  it('SCHEDULED 라운드가 여러 개면 라운드 귀속 없이 결과 미확정', () => {
    const items = buildActionItems(
      [
        dashboardInput({
          stats: stats({ interviewPending: 4 }),
          candidateCount: 1,
          rounds: [
            round({ roundId: 7, title: '1차 면접', status: 'SCHEDULED' }),
            round({ roundId: 8, title: '2차 면접', status: 'SCHEDULED' }),
          ],
        }),
      ],
      NOW,
    );
    const pending = items.find((i) => i.type === 'INTERVIEW_RESULT_PENDING');
    expect(pending?.count).toBe(3);
    expect(pending?.roundId).toBeUndefined();
    expect(pending?.roundTitle).toBeUndefined();
  });

  it('대기열 미로딩(candidateCount undefined)이면 결과 미확정을 만들지 않는다', () => {
    const items = buildActionItems(
      [dashboardInput({ stats: stats({ interviewPending: 4 }), candidateCount: undefined, rounds: [round({ status: 'SCHEDULED' })] })],
      NOW,
    );
    expect(items.some((i) => i.type === 'INTERVIEW_RESULT_PENDING')).toBe(false);
  });

  it('마감 임박은 더 이상 액션 아이템을 만들지 않는다(진행 중 모집 카드 D-day로 이관)', () => {
    const input: RecruitmentDashboardInput[] = [
      dashboardInput({ recruitment: recruitment({ endDate: '2026-06-14' }) }),
    ];
    expect(buildActionItems(input, NOW)).toHaveLength(0);
  });

  it('대기열 인원 존재 + 라운드 없음 → 면접 라운드 생성 필요', () => {
    const items = buildActionItems([dashboardInput({ candidateCount: 3, rounds: [] })], NOW);
    const roundNeeded = items.find((i) => i.type === 'INTERVIEW_ROUND_NEEDED');
    expect(roundNeeded).toBeDefined();
    expect(roundNeeded?.count).toBe(3);
    expect(roundNeeded?.recruitmentId).toBe(1);
    expect(roundNeeded?.roundId).toBeUndefined();
    expect(roundNeeded?.daysLeft).toBeUndefined();
  });

  it('SCHEDULED 라운드만 있으면(신규 수용 불가) 여전히 라운드 생성 필요', () => {
    const items = buildActionItems(
      [dashboardInput({ candidateCount: 3, rounds: [round({ status: 'SCHEDULED' })] })],
      NOW,
    );
    expect(items.some((i) => i.type === 'INTERVIEW_ROUND_NEEDED')).toBe(true);
  });

  it('수용 가능 라운드(DRAFT·COLLECTING·ASSIGNING)가 있으면 라운드 생성 필요 아님', () => {
    for (const acceptingStatus of ['DRAFT', 'COLLECTING', 'ASSIGNING'] as const) {
      const items = buildActionItems(
        [dashboardInput({ candidateCount: 3, rounds: [round({ status: acceptingStatus })] })],
        NOW,
      );
      expect(items.some((i) => i.type === 'INTERVIEW_ROUND_NEEDED')).toBe(false);
    }
  });

  it('대기열 0명 또는 undefined → 라운드 생성 필요 아님', () => {
    const zeroItems = buildActionItems([dashboardInput({ candidateCount: 0 })], NOW);
    expect(zeroItems.some((i) => i.type === 'INTERVIEW_ROUND_NEEDED')).toBe(false);
    const undefinedItems = buildActionItems([dashboardInput({ candidateCount: undefined })], NOW);
    expect(undefinedItems.some((i) => i.type === 'INTERVIEW_ROUND_NEEDED')).toBe(false);
  });

  it('라운드 미로딩(undefined)이면 대기열이 있어도 라운드 생성 필요 아님', () => {
    const items = buildActionItems([dashboardInput({ candidateCount: 3, rounds: undefined })], NOW);
    expect(items.some((i) => i.type === 'INTERVIEW_ROUND_NEEDED')).toBe(false);
  });

  it('CANCELLED 라운드만 있으면(취소 후 재대기열) 라운드 생성 필요', () => {
    const items = buildActionItems(
      [dashboardInput({ candidateCount: 3, rounds: [round({ status: 'CANCELLED' })] })],
      NOW,
    );
    expect(items.some((i) => i.type === 'INTERVIEW_ROUND_NEEDED')).toBe(true);
  });

  it('CANCELLED + COLLECTING 혼재면 수용 가능 라운드가 있어 라운드 생성 필요 아님', () => {
    const items = buildActionItems(
      [
        dashboardInput({
          candidateCount: 3,
          rounds: [round({ roundId: 100, status: 'CANCELLED' }), round({ roundId: 101, status: 'COLLECTING' })],
        }),
      ],
      NOW,
    );
    expect(items.some((i) => i.type === 'INTERVIEW_ROUND_NEEDED')).toBe(false);
  });
});

describe('sortActionItems', () => {
  it('기한 있는 항목이 daysLeft 오름차순으로 먼저, 그 뒤 타입 우선순위', () => {
    const items = buildActionItems(
      [
        dashboardInput({
          recruitment: recruitment({ id: 1 }),
          stats: stats({ submitted: 1 }),
          rounds: [
            round({ roundId: 9, status: 'ASSIGNING' }),
            round({
              roundId: 11, status: 'COLLECTING',
              totalMemberCount: 5, respondedMemberCount: 3, availabilityDeadline: '2026-06-14',
            }),
          ],
        }),
      ],
      NOW,
    );
    const sorted = sortActionItems(items);
    // 응답 미수집(daysLeft=2) → 기한 없는 ASSIGNING → 검토 대기 순
    expect(sorted[0]?.type).toBe('INTERVIEW_RESPONSE_UNCOLLECTED');
    expect(sorted[0]?.daysLeft).toBe(2);
    expect(sorted[1]?.type).toBe('INTERVIEW_ROUND_UNCONFIRMED');
    expect(sorted[2]?.type).toBe('APPLICANTS_AWAITING_REVIEW');
  });

  it('기한 없는 항목 중 INTERVIEW_ROUND_NEEDED가 INTERVIEW_ROUND_UNCONFIRMED보다 먼저', () => {
    const items = buildActionItems(
      [
        dashboardInput({ recruitment: recruitment({ id: 2 }), rounds: [round({ status: 'ASSIGNING' })] }),
        dashboardInput({ recruitment: recruitment({ id: 1 }), candidateCount: 3 }),
      ],
      NOW,
    );
    const sorted = sortActionItems(items);
    expect(sorted[0]?.type).toBe('INTERVIEW_ROUND_NEEDED');
    expect(sorted[1]?.type).toBe('INTERVIEW_ROUND_UNCONFIRMED');
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
