import { describe, it, expect } from 'vitest';
import type {
  ActionItem,
  RecruitmentSummary,
  StatsSummary,
  InterviewRoundSummary,
  TodayScheduleItem,
} from '@duing/types';
import {
  CLOSING_SOON_DAYS,
  buildActionItems,
  buildClosedRecruitmentItems,
  buildRecruitmentActionItems,
  countAwaitingReview,
  countUndecided,
  groupDashboardTasks,
  isActiveRecruitment,
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
    targetRole: 'MEMBER', closedAt: null, ...over,
  };
}

function stats(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    total: 0, submitted: 0, onHold: 0, interviewPending: 0,
    accepted: 0, rejected: 0, capacity: 20, ratio: 0, ...over,
  };
}

function round(over: Partial<InterviewRoundSummary> = {}): InterviewRoundSummary {
  return {
    roundId: 100, title: '1차 면접', status: 'DRAFT',
    availabilityDeadline: null, location: null,
    // 인원 0 이면 응답 수집·배정 검토 줄이 빠지므로 기본은 응답이 다 모인 라운드 — 인원 0 을 보는 테스트만 0 을 넣는다.
    totalMemberCount: 3, respondedMemberCount: 3, ...over,
  };
}

function dashboardInput(over: Partial<RecruitmentDashboardInput> = {}): RecruitmentDashboardInput {
  return { recruitment: recruitment(), stats: stats(), rounds: [], candidateCount: undefined, ...over };
}

describe('buildActionItems', () => {
  it('검토 대기 지원자(submitted+onHold>0)를 만든다', () => {
    const input: RecruitmentDashboardInput[] = [
      dashboardInput({ stats: stats({ submitted: 2, onHold: 3 }) }),
    ];
    const items = buildActionItems(input, NOW);
    const review = items.find((i) => i.type === 'APPLICANTS_AWAITING_REVIEW');
    expect(review).toBeDefined();
    expect(review?.count).toBe(5);
    expect(review?.recruitmentId).toBe(1);
  });

  it('보류(onHold)만 있어도 검토 대기 지원자를 만든다', () => {
    const input: RecruitmentDashboardInput[] = [
      dashboardInput({ stats: stats({ submitted: 0, onHold: 4 }) }),
    ];
    const items = buildActionItems(input, NOW);
    const review = items.find((i) => i.type === 'APPLICANTS_AWAITING_REVIEW');
    expect(review?.count).toBe(4);
  });

  // '응답 마감 없음' 줄 말고는 응답 마감을 넣는다 — 마감이 없으면 'daysLeft 없음' 기대가 아무것도 고정하지 못한다.
  const roundLine = { recruitmentId: 1, recruitmentTitle: '2026 봄 모집', roundId: 7, roundTitle: '1차 면접' };
  it.each<[string, Partial<InterviewRoundSummary>, ActionItem[]]>([
    ['DRAFT', { status: 'DRAFT', availabilityDeadline: '2026-06-10' }, [{ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...roundLine, roundStatus: 'DRAFT' }]],
    [
      'COLLECTING 응답 4/10',
      { status: 'COLLECTING', totalMemberCount: 10, respondedMemberCount: 4, availabilityDeadline: '2026-06-10' },
      [{ type: 'INTERVIEW_RESPONSE_UNCOLLECTED', ...roundLine, count: 6, daysLeft: -2 }],
    ],
    [
      'COLLECTING 응답 10/10',
      { status: 'COLLECTING', totalMemberCount: 10, respondedMemberCount: 10, availabilityDeadline: '2026-06-15' },
      [{ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...roundLine, roundStatus: 'COLLECTING', daysLeft: 3 }],
    ],
    [
      'COLLECTING 인원 0',
      { status: 'COLLECTING', totalMemberCount: 0, respondedMemberCount: 0, availabilityDeadline: '2026-06-15' },
      [],
    ],
    [
      'COLLECTING 응답 0/1',
      { status: 'COLLECTING', totalMemberCount: 1, respondedMemberCount: 0, availabilityDeadline: '2026-06-15' },
      [{ type: 'INTERVIEW_RESPONSE_UNCOLLECTED', ...roundLine, count: 1, daysLeft: 3 }],
    ],
    [
      'COLLECTING 응답 10/10·응답 마감 없음',
      { status: 'COLLECTING', totalMemberCount: 10, respondedMemberCount: 10, availabilityDeadline: null },
      [{ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...roundLine, roundStatus: 'COLLECTING' }],
    ],
    ['ASSIGNING', { status: 'ASSIGNING', availabilityDeadline: '2026-06-10' }, [{ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...roundLine, roundStatus: 'ASSIGNING' }]],
    ['ASSIGNING 응답 0/1', { status: 'ASSIGNING', totalMemberCount: 1, respondedMemberCount: 0, availabilityDeadline: '2026-06-10' }, [{ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...roundLine, roundStatus: 'ASSIGNING' }]],
    ['ASSIGNING 인원 0', { status: 'ASSIGNING', totalMemberCount: 0, respondedMemberCount: 0, availabilityDeadline: '2026-06-10' }, []],
    ['DRAFT 인원 0', { status: 'DRAFT', totalMemberCount: 0, respondedMemberCount: 0, availabilityDeadline: '2026-06-10' }, [{ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...roundLine, roundStatus: 'DRAFT' }]],
    ['SCHEDULED', { status: 'SCHEDULED', availabilityDeadline: '2026-06-10' }, []],
    ['CANCELLED', { status: 'CANCELLED', availabilityDeadline: '2026-06-10' }, []],
  ])('라운드 상태별 할 일 줄(진행 중이면 한 줄, 인원 0 인 응답 수집·배정 검토는 없음) — %s', (_name, roundOverrides, expectedItems) => {
    const items = buildActionItems([dashboardInput({ rounds: [round({ roundId: 7, ...roundOverrides })] })], NOW);
    expect(items).toEqual(expectedItems);
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

  it.each<InterviewRoundSummary['status']>(['DRAFT', 'COLLECTING', 'ASSIGNING'])(
    '진행 중(%s) 라운드 멤버는 결과 미확정에서 뺀다 — 확정 라운드에서 결과를 기다리는 사람만 센다',
    (inProgressStatus) => {
      const items = buildActionItems(
        [
          dashboardInput({
            stats: stats({ interviewPending: 7 }), // 1차 결과 대기 1 + 2차 멤버 4 + 대기열 2
            candidateCount: 2,
            rounds: [
              round({ roundId: 8, title: '2차 면접', status: inProgressStatus, totalMemberCount: 4 }),
              round({ roundId: 7, title: '1차 면접', status: 'SCHEDULED' }),
            ],
          }),
        ],
        NOW,
      );
      expect(items.find((item) => item.type === 'INTERVIEW_RESULT_PENDING')).toMatchObject({
        count: 1,
        roundId: 7,
        roundTitle: '1차 면접',
      });
    },
  );

  it.each([
    ['진행 중 라운드 몫만 남음(0)', 7],
    ['계산이 음수(옛 데이터·순간 어긋남)', 4],
  ])('확정 라운드에 결과를 기다리는 사람이 없으면 결과 미확정을 만들지 않는다 — %s', (_name, interviewPending) => {
    const items = buildActionItems(
      [
        dashboardInput({
          stats: stats({ interviewPending }), // 2차 멤버 5 + 대기열 2 = 7 이 정상값
          candidateCount: 2,
          rounds: [
            round({ roundId: 8, title: '2차 면접', status: 'COLLECTING', totalMemberCount: 5 }),
            round({ roundId: 7, title: '1차 면접', status: 'SCHEDULED' }),
          ],
        }),
      ],
      NOW,
    );
    expect(items.some((item) => item.type === 'INTERVIEW_RESULT_PENDING')).toBe(false);
  });

  it('취소 라운드 인원은 빼지 않는다 — 그 멤버는 대기열로 돌아가 이미 빠졌다', () => {
    const items = buildActionItems(
      [
        dashboardInput({
          stats: stats({ interviewPending: 3 }), // 1차 결과 대기 1 + 대기열 2(취소된 2차에서 돌아온 사람 포함)
          candidateCount: 2,
          rounds: [
            round({ roundId: 8, title: '2차 면접', status: 'CANCELLED', totalMemberCount: 4 }),
            round({ roundId: 7, title: '1차 면접', status: 'SCHEDULED' }),
          ],
        }),
      ],
      NOW,
    );
    expect(items.find((item) => item.type === 'INTERVIEW_RESULT_PENDING')).toMatchObject({ count: 1, roundId: 7 });
  });

  it('확정 라운드가 둘이고 진행 중 라운드가 있으면 진행 중 인원을 뺀 합계를 라운드 이름 없이 낸다', () => {
    const items = buildActionItems(
      [
        dashboardInput({
          stats: stats({ interviewPending: 9 }), // 1차·2차 결과 대기 각 1 + 3차 멤버 5 + 대기열 2
          candidateCount: 2,
          rounds: [
            round({ roundId: 9, title: '3차 면접', status: 'COLLECTING', totalMemberCount: 5 }),
            round({ roundId: 8, title: '2차 면접', status: 'SCHEDULED' }),
            round({ roundId: 7, title: '1차 면접', status: 'SCHEDULED' }),
          ],
        }),
      ],
      NOW,
    );
    const pending = items.find((item) => item.type === 'INTERVIEW_RESULT_PENDING');
    expect(pending?.count).toBe(2);
    expect(pending?.roundId).toBeUndefined();
    expect(pending?.roundTitle).toBeUndefined();
  });

  it('확정 라운드가 없으면 계산이 양수여도 결과 미확정을 만들지 않는다 — 진행 중 라운드 인원이 먼저 줄어든 순간 어긋남', () => {
    const items = buildActionItems(
      [
        dashboardInput({
          stats: stats({ interviewPending: 6 }),
          candidateCount: 2,
          rounds: [round({ roundId: 8, title: '2차 면접', status: 'COLLECTING', totalMemberCount: 3 })],
        }),
      ],
      NOW,
    );
    expect(items.some((item) => item.type === 'INTERVIEW_RESULT_PENDING')).toBe(false);
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

  it('SCHEDULED 라운드만 있으면(초안 없음) 여전히 라운드 생성 필요', () => {
    const items = buildActionItems(
      [dashboardInput({ candidateCount: 3, rounds: [round({ status: 'SCHEDULED' })] })],
      NOW,
    );
    expect(items.some((i) => i.type === 'INTERVIEW_ROUND_NEEDED')).toBe(true);
  });

  it('발송 전 초안(DRAFT)이 있으면 인원 0 이어도 라운드 생성 필요 없이 그 초안의 줄만 — 초안이 새 라운드 생성을 막는다', () => {
    const items = buildActionItems([dashboardInput({ candidateCount: 3, rounds: [round({ status: 'DRAFT', totalMemberCount: 0, respondedMemberCount: 0 })] })], NOW);
    expect(items.some((item) => item.type === 'INTERVIEW_ROUND_NEEDED')).toBe(false);
    expect(items.filter((item) => item.type === 'INTERVIEW_ROUND_UNCONFIRMED').map((item) => item.roundStatus)).toEqual(['DRAFT']);
  });

  it('응답 수집 1차 + 초안 2차여도 초안이 있으면 라운드 생성 필요 아님 — 라운드 순서와 상관없이', () => {
    const collectingRound = round({ roundId: 100, status: 'COLLECTING' });
    const draftRound = round({ roundId: 101, title: '2차 면접', status: 'DRAFT' });
    // 서버는 최신순(초안이 맨 앞)으로 준다 — 두 순서를 다 돌려 첫 라운드만·마지막 라운드만 보는 판정을 함께 막는다.
    for (const rounds of [[draftRound, collectingRound], [collectingRound, draftRound]]) {
      const items = buildActionItems([dashboardInput({ candidateCount: 3, rounds })], NOW);
      expect(items.some((item) => item.type === 'INTERVIEW_ROUND_NEEDED')).toBe(false);
    }
  });

  it.each<InterviewRoundSummary['status']>(['COLLECTING', 'ASSIGNING'])(
    '%s 라운드가 있어도 초안이 없으면 라운드 생성 필요와 그 라운드의 줄 — 응답이 다 모인 픽스처라 미확정',
    (roundStatus) => {
      const items = buildActionItems([dashboardInput({ candidateCount: 3, rounds: [round({ status: roundStatus })] })], NOW);
      expect(items.find((item) => item.type === 'INTERVIEW_ROUND_NEEDED')?.count).toBe(3);
      expect(items.filter((item) => item.type === 'INTERVIEW_ROUND_UNCONFIRMED').map((item) => item.roundStatus)).toEqual([roundStatus]);
    },
  );

  it('확정 1차 + 응답 수집 2차(인원 0)에 대기열 2명이면 라운드 생성 필요 2명·1차 결과 미확정 3명 — 인원 0 인 2차의 줄만 빠진다', () => {
    const items = buildActionItems(
      [
        dashboardInput({
          stats: stats({ interviewPending: 5 }), // 1차 결과 미결 3 + 대기열 2
          candidateCount: 2,
          rounds: [
            round({ roundId: 6, status: 'SCHEDULED' }),
            round({ roundId: 7, title: '2차 면접', status: 'COLLECTING', totalMemberCount: 0, respondedMemberCount: 0 }),
          ],
        }),
      ],
      NOW,
    );
    expect(items).toEqual([
      { type: 'INTERVIEW_ROUND_NEEDED', recruitmentId: 1, recruitmentTitle: '2026 봄 모집', count: 2 },
      { type: 'INTERVIEW_RESULT_PENDING', recruitmentId: 1, recruitmentTitle: '2026 봄 모집', roundId: 6, roundTitle: '1차 면접', count: 3 },
    ]);
  });

  it('서버 순서(최신순)대로 인원 0 라운드가 앞에 와도 뒤 라운드의 줄은 남는다', () => {
    const rounds = [
      round({ roundId: 8, title: '2차 면접', status: 'COLLECTING', totalMemberCount: 0, respondedMemberCount: 0 }),
      round({ roundId: 7, status: 'ASSIGNING' }),
    ];
    const items = buildActionItems([dashboardInput({ rounds })], NOW);
    expect(items).toEqual([{ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...roundLine, roundStatus: 'ASSIGNING' }]);
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

  it('CANCELLED + COLLECTING 혼재여도 초안이 없으면 라운드 생성 필요', () => {
    const items = buildActionItems(
      [
        dashboardInput({
          candidateCount: 3,
          rounds: [round({ roundId: 100, status: 'CANCELLED' }), round({ roundId: 101, status: 'COLLECTING' })],
        }),
      ],
      NOW,
    );
    expect(items.find((item) => item.type === 'INTERVIEW_ROUND_NEEDED')?.count).toBe(3);
    // 응답이 다 모인 COLLECTING 은 미확정 줄을 낸다 — 취소 라운드는 줄을 내지 않는다.
    expect(items.filter((i) => i.type === 'INTERVIEW_ROUND_UNCONFIRMED').map((i) => i.roundId)).toEqual([101]);
  });

  it('검토 대기에 미처리가 있으면 가장 오래된 미처리부터 지난 KST 날짜 수를 싣는다', () => {
    const items = buildActionItems(
      [dashboardInput({ stats: stats({ submitted: 2, onHold: 1, oldestPendingSubmittedAt: '2026-06-05T03:00:00Z' }) })],
      NOW,
    );
    expect(items.find((item) => item.type === 'APPLICANTS_AWAITING_REVIEW')).toMatchObject({ count: 3, pendingDays: 7 });
  });

  it('보류만 남았거나(미처리 0) 시각을 모르면 미처리 일수를 싣지 않는다', () => {
    const onHoldOnly = buildActionItems(
      [dashboardInput({ stats: stats({ submitted: 0, onHold: 2, oldestPendingSubmittedAt: '2026-06-01T03:00:00Z' }) })],
      NOW,
    );
    const legacyBackend = buildActionItems([dashboardInput({ stats: stats({ submitted: 2 }) })], NOW);
    const nullTime = buildActionItems([dashboardInput({ stats: stats({ submitted: 2, oldestPendingSubmittedAt: null }) })], NOW);
    for (const items of [onHoldOnly, legacyBackend, nullTime]) {
      expect(items.find((item) => item.type === 'APPLICANTS_AWAITING_REVIEW')).not.toHaveProperty('pendingDays');
    }
  });

  it('미처리 일수는 KST 날짜로 센다 — 자정 직후면 1시간 전 제출도 1일', () => {
    const items = buildActionItems(
      [dashboardInput({ stats: stats({ submitted: 1, oldestPendingSubmittedAt: '2026-06-11T14:30:00Z' }) })], // KST 6/11 23:30
      new Date('2026-06-11T15:30:00Z'), // KST 6/12 00:30
    );
    expect(items.find((item) => item.type === 'APPLICANTS_AWAITING_REVIEW')).toMatchObject({ pendingDays: 1 });
  });

  it('KST 날짜로 7일째가 되는 0시에 지금 처리로 올라가고, 칩이 읽는 일수도 같은 값이다', () => {
    const awaitingAt = (now: Date) => {
      const items = buildActionItems(
        [dashboardInput({ stats: stats({ submitted: 1, oldestPendingSubmittedAt: '2026-06-05T14:30:00Z' }) })], // KST 6/5 23:30
        now,
      );
      const group = groupDashboardTasks(items, []).find((candidate) =>
        candidate.tasks.some((task) => task.source === 'RECRUITMENT' && task.item.type === 'APPLICANTS_AWAITING_REVIEW'),
      );
      return {
        pendingDays: items.find((item) => item.type === 'APPLICANTS_AWAITING_REVIEW')?.pendingDays,
        group: group?.key,
      };
    };
    expect(awaitingAt(new Date('2026-06-11T14:59:00Z'))).toEqual({ pendingDays: 6, group: 'WAITING' }); // KST 6/11 23:59
    expect(awaitingAt(new Date('2026-06-11T15:01:00Z'))).toEqual({ pendingDays: 7, group: 'NOW' }); // KST 6/12 00:01
  });
});

describe('countAwaitingReview', () => {
  it('검토 대기 = submitted + onHold — 면접 대상은 세지 않는다', () => {
    expect(countAwaitingReview(stats({ submitted: 1, onHold: 2, interviewPending: 3, accepted: 4, rejected: 5 }))).toBe(3);
  });
});

describe('countUndecided', () => {
  it('결과(합격·불합격)가 없는 지원 = submitted + onHold + interviewPending', () => {
    expect(countUndecided(stats({ submitted: 1, onHold: 2, interviewPending: 3, accepted: 4, rejected: 5 }))).toBe(6);
  });
});

describe('buildClosedRecruitmentItems', () => {
  const closedRecruitment = recruitment({ status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false });

  it('미결 지원이 남은 마감 모집 → 마감 모집 결과 미확정', () => {
    const items = buildClosedRecruitmentItems([
      { recruitment: closedRecruitment, stats: stats({ submitted: 1, onHold: 1, interviewPending: 1 }) },
    ]);
    expect(items).toEqual([
      { type: 'CLOSED_RECRUITMENT_UNDECIDED', recruitmentId: 1, recruitmentTitle: '2026 봄 모집', count: 3 },
    ]);
  });

  it('전원 확정이면 만들지 않는다', () => {
    const items = buildClosedRecruitmentItems([
      { recruitment: closedRecruitment, stats: stats({ accepted: 3, rejected: 2 }) },
    ]);
    expect(items).toEqual([]);
  });

  it('통계 미로딩(undefined)이면 만들지 않는다', () => {
    expect(buildClosedRecruitmentItems([{ recruitment: closedRecruitment, stats: undefined }])).toEqual([]);
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

  it('기한 없는 마감 모집 결과 미확정은 검토 대기 지원자 뒤로 간다', () => {
    const sorted = sortActionItems([
      { type: 'CLOSED_RECRUITMENT_UNDECIDED', recruitmentId: 2, recruitmentTitle: '가을 모집', count: 1 },
      { type: 'APPLICANTS_AWAITING_REVIEW', recruitmentId: 1, recruitmentTitle: '봄 모집', count: 2 },
    ]);
    expect(sorted.map((item) => item.type)).toEqual(['APPLICANTS_AWAITING_REVIEW', 'CLOSED_RECRUITMENT_UNDECIDED']);
  });
});

describe('aggregateApplicantTotals', () => {
  it('여러 모집 통계를 합산한다(undefined 무시)', () => {
    const totals = aggregateApplicantTotals([
      stats({ total: 5, submitted: 2, onHold: 1, accepted: 1, capacity: 20 }),
      undefined,
      stats({ total: 3, submitted: 1, onHold: 2, interviewPending: 2, capacity: 10 }),
    ]);
    expect(totals.total).toBe(8);
    expect(totals.submitted).toBe(3);
    expect(totals.onHold).toBe(3);
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
  });
});

describe('buildActionItems — 검토 대기의 지원 완료·보류 인원', () => {
  it('검토 대기 항목에 지원 완료·보류 인원을 따로 싣는다', () => {
    const items = buildActionItems([dashboardInput({ stats: stats({ submitted: 9, onHold: 3 }) })], NOW);
    expect(items.find((item) => item.type === 'APPLICANTS_AWAITING_REVIEW')).toMatchObject({ count: 12, submitted: 9, onHold: 3 });
  });

  it('다른 종류 항목에는 싣지 않는다', () => {
    const items = buildActionItems(
      [dashboardInput({ stats: stats({ submitted: 1 }), rounds: [round({ roundId: 7, status: 'ASSIGNING' })] })],
      NOW,
    );
    const unconfirmed = items.find((item) => item.type === 'INTERVIEW_ROUND_UNCONFIRMED');
    expect(unconfirmed).toBeDefined();
    expect(unconfirmed).not.toHaveProperty('submitted');
    expect(unconfirmed).not.toHaveProperty('onHold');
  });
});

describe('buildRecruitmentActionItems — 운영진 홈·모집 상세 단일 입구', () => {
  const closed = { status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false } as const;

  it.each(['SELF', 'EXTERNAL'] as const)('진행 중 모집(%s)은 buildActionItems 와 같다', (applicationMode) => {
    const input = dashboardInput({
      recruitment: recruitment({ applicationMode }),
      stats: stats({ submitted: 2, onHold: 1 }),
      rounds: [round({ roundId: 7, status: 'ASSIGNING' })],
      candidateCount: 1,
    });
    const items = buildRecruitmentActionItems(input, NOW);
    expect(items).toHaveLength(3);
    expect(items).toEqual(buildActionItems([input], NOW));
  });

  it('기간이 지난 접수 중(raw OPEN + 표시 CLOSED)도 진행 중 규칙을 따른다', () => {
    const input = dashboardInput({
      recruitment: recruitment({ status: 'OPEN', displayStatus: 'CLOSED', effectivelyOpen: false }),
      stats: stats({ submitted: 2 }),
      rounds: [round({ roundId: 7, status: 'ASSIGNING' })],
    });
    expect(isActiveRecruitment(input.recruitment)).toBe(true);
    expect(buildRecruitmentActionItems(input, NOW).map((item) => item.type)).toEqual(['APPLICANTS_AWAITING_REVIEW', 'INTERVIEW_ROUND_UNCONFIRMED']);
  });

  it('마감 자체 폼 모집은 결과 미확정만 — 라운드·대기열이 있어도 면접 항목을 만들지 않는다', () => {
    const input = dashboardInput({
      recruitment: recruitment(closed),
      stats: stats({ submitted: 1, onHold: 1, interviewPending: 2 }),
      rounds: [round({ roundId: 7, status: 'ASSIGNING' })],
      candidateCount: 2,
    });
    expect(isActiveRecruitment(input.recruitment)).toBe(false);
    expect(buildRecruitmentActionItems(input, NOW)).toEqual([
      { type: 'CLOSED_RECRUITMENT_UNDECIDED', recruitmentId: 1, recruitmentTitle: '2026 봄 모집', count: 4 },
    ]);
  });

  it('마감 외부 폼 모집은 항목이 없다', () => {
    const input = dashboardInput({ recruitment: recruitment({ ...closed, applicationMode: 'EXTERNAL' }), stats: stats({ submitted: 3 }) });
    expect(buildRecruitmentActionItems(input, NOW)).toEqual([]);
  });
});
