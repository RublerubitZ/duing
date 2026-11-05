import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import type { ApplicationStatus, DashboardTaskGroup, InterviewRoundSummary, RecruitmentSummary, StatsSummary } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { useClubActionItems, useRecruitmentActionItems } from '../src/dashboard';
import { groupDashboardTasks } from '../src/dashboardSelectors';
import { useInterviewRoundsQuery } from '../src/interviewRound';
import { interviewRoundKeys } from '../src/interviewRoundQueryKeys';
import { statsQueryKeys } from '../src/statsQueryKeys';

const NOW = new Date('2026-06-12T03:00:00Z'); // 6/12 KST 12:00
const CLUB_ID = 10;
const RECRUITMENT_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}
function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}

function recruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: RECRUITMENT_ID, clubId: CLUB_ID, clubName: '두잉', title: '봄 모집',
    startDate: '2026-06-01', endDate: '2026-06-30', capacity: 20,
    status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
    applicationMode: 'SELF', externalFormUrl: null, useInterview: true,
    targetRole: 'MEMBER', closedAt: null, ...over,
  };
}
const CLOSED = { status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false } as const;

function statsBody(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    total: 9, submitted: 2, onHold: 1, interviewPending: 3, accepted: 0, rejected: 0, capacity: 20, ratio: 0,
    oldestPendingSubmittedAt: '2026-06-03T01:00:00Z', // KST 6/3 → 6/12 기준 9일
    ...over,
  };
}
const ROUNDS: InterviewRoundSummary[] = [
  { roundId: 7, title: '1차 면접', status: 'ASSIGNING', availabilityDeadline: null, location: null, totalMemberCount: 3, respondedMemberCount: 3 },
  { roundId: 8, title: '2차 면접', status: 'COLLECTING', availabilityDeadline: '2026-06-14T14:59:00Z', location: null, totalMemberCount: 3, respondedMemberCount: 1 },
  { roundId: 9, title: '3차 면접', status: 'SCHEDULED', availabilityDeadline: null, location: null, totalMemberCount: 2, respondedMemberCount: 2 },
];
function candidate(applicationId: number, status: ApplicationStatus) {
  return {
    applicationId, userId: applicationId + 100, userName: `지원자${applicationId}`, studentId: `2025${applicationId}`,
    college: 'IT_ENGINEERING', major: '컴퓨터공학과', grade: 'SOPHOMORE', status, submittedAt: '2026-06-05T01:00:00Z',
  };
}
const QUEUE = [candidate(31, 'INTERVIEW_PENDING'), candidate(32, 'INTERVIEW_PENDING')];

const calls = { rounds: 0, candidatesDecided: 0, candidatesUndecided: 0 };
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });
const serverError = () => HttpResponse.json({ ok: false, message: '서버 오류', data: null }, { status: 500 });

/** 모집 목록(홈용)·통계 응답을 정한다. 라운드·대기열은 기본 핸들러가 호출 수를 센다. */
function scenario(target: RecruitmentSummary, stats: StatsSummary | 'error' = statsBody()) {
  server.use(
    http.get(`*/clubs/${CLUB_ID}/recruitments`, () => json([target])),
    http.get(`*/leader/recruitments/${RECRUITMENT_ID}/stats/summary`, () => (stats === 'error' ? serverError() : json(stats))),
  );
}

const server = setupServer(
  http.get(`*/leader/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => {
    calls.rounds += 1;
    return json(ROUNDS);
  }),
  // 홈과 같은 includeUndecided=false 를 받아야 한다 — true 면 지원 완료 1명이 더 와서 "결과 미확정" 수가 달라진다.
  http.get(`*/leader/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
    if (new URL(request.url).searchParams.get('includeUndecided') === 'true') {
      calls.candidatesUndecided += 1;
      return json([...QUEUE, candidate(33, 'SUBMITTED')]);
    }
    calls.candidatesDecided += 1;
    return json(QUEUE);
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  calls.rounds = 0;
  calls.candidatesDecided = 0;
  calls.candidatesUndecided = 0;
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

const shape = (groups: DashboardTaskGroup[]) => groups.map((group) => [group.key, group.tasks.map((task) => task.item.type)]);

describe('useRecruitmentActionItems', () => {
  it('진행 중 + 면접 사용 — 홈과 같은 키로 통계·라운드·대기열(includeUndecided=false)을 받아 묶는다', async () => {
    const target = recruitment();
    scenario(target);
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useRecruitmentActionItems(target), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(shape(result.current.groups)).toEqual([
      ['NOW', ['INTERVIEW_ROUND_UNCONFIRMED', 'INTERVIEW_RESULT_PENDING', 'APPLICANTS_AWAITING_REVIEW']],
      ['WAITING', ['INTERVIEW_RESPONSE_UNCOLLECTED', 'INTERVIEW_ROUND_NEEDED']],
    ]);
    const resultPending = result.current.groups[0]?.tasks.find((task) => task.item.type === 'INTERVIEW_RESULT_PENDING');
    expect(resultPending?.item).toMatchObject({ count: 1, roundId: 9 }); // 면접 대상 3 − 대기열 2
    const awaiting = result.current.groups[0]?.tasks.find((task) => task.item.type === 'APPLICANTS_AWAITING_REVIEW');
    expect(awaiting?.item).toMatchObject({ count: 3, submitted: 2, onHold: 1, pendingDays: 9 });
    expect(result.current.submittedCount).toBe(2);
    expect(result.current.isError).toBe(false);
    // 홈·라운드 화면·무효화와 같은 캐시 키
    expect(queryClient.getQueryState(statsQueryKeys.summary(RECRUITMENT_ID))?.status).toBe('success');
    expect(queryClient.getQueryState(interviewRoundKeys.list(RECRUITMENT_ID))?.status).toBe('success');
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(RECRUITMENT_ID, false))?.status).toBe('success');
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(RECRUITMENT_ID, true))).toBeUndefined();
    expect(calls.candidatesUndecided).toBe(0);
  });

  it('면접 안 씀 — 라운드·대기열을 요청하지 않는다', async () => {
    const target = recruitment({ useInterview: false });
    scenario(target);
    const { result } = renderHook(() => useRecruitmentActionItems(target), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(shape(result.current.groups)).toEqual([['NOW', ['APPLICANTS_AWAITING_REVIEW']]]);
    expect(calls).toEqual({ rounds: 0, candidatesDecided: 0, candidatesUndecided: 0 });
  });

  it('면접 안 씀 — 같은 키에 남은 라운드·대기열 캐시를 입력으로 쓰지 않는다', async () => {
    const target = recruitment({ useInterview: false });
    scenario(target);
    const queryClient = newQueryClient();
    queryClient.setQueryData(interviewRoundKeys.list(RECRUITMENT_ID), ROUNDS);
    queryClient.setQueryData(interviewRoundKeys.candidates(RECRUITMENT_ID, false), QUEUE);
    const { result } = renderHook(() => useRecruitmentActionItems(target), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(shape(result.current.groups)).toEqual([['NOW', ['APPLICANTS_AWAITING_REVIEW']]]);
  });

  it('마감 자체 폼 + 면접 사용 — 통계만 받아 결과 미확정만 만든다', async () => {
    const target = recruitment(CLOSED);
    scenario(target, statsBody({ submitted: 1, onHold: 2, interviewPending: 3 }));
    const { result } = renderHook(() => useRecruitmentActionItems(target), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(shape(result.current.groups)).toEqual([['NOW', ['CLOSED_RECRUITMENT_UNDECIDED']]]);
    expect(result.current.groups[0]?.tasks[0]?.item).toMatchObject({ type: 'CLOSED_RECRUITMENT_UNDECIDED', count: 6 });
    expect(calls).toEqual({ rounds: 0, candidatesDecided: 0, candidatesUndecided: 0 });
  });

  it('마감 + 면접 사용 — 같은 화면의 면접 단계 칩이 라운드 조회에 실패해도 카드는 로딩·오류가 아니다', async () => {
    const target = recruitment(CLOSED);
    scenario(target, statsBody({ submitted: 0, onHold: 0, interviewPending: 0 }));
    server.use(http.get(`*/leader/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => serverError()));
    const { result } = renderHook(
      () => ({ detail: useRecruitmentActionItems(target), chip: useInterviewRoundsQuery(RECRUITMENT_ID) }),
      { wrapper: makeWrapper(newQueryClient()) },
    );
    await waitFor(() => expect(result.current.chip.isError).toBe(true));
    await waitFor(() => expect(result.current.detail.isLoading).toBe(false));
    expect(result.current.detail.isError).toBe(false);
    expect(result.current.detail.groups).toEqual([]);
  });

  it('대기열만 실패 — isError 이고, 대기열 없이 만들 수 있는 항목은 남는다', async () => {
    const target = recruitment();
    scenario(target);
    server.use(http.get(`*/leader/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, () => serverError()));
    const { result } = renderHook(() => useRecruitmentActionItems(target), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(shape(result.current.groups)).toEqual([
      ['NOW', ['INTERVIEW_ROUND_UNCONFIRMED', 'APPLICANTS_AWAITING_REVIEW']],
      ['WAITING', ['INTERVIEW_RESPONSE_UNCOLLECTED']],
    ]);
  });

  it('통계를 받지 못하고 실패 — submittedCount 는 undefined', async () => {
    const target = recruitment({ useInterview: false });
    scenario(target, 'error');
    const { result } = renderHook(() => useRecruitmentActionItems(target), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.submittedCount).toBeUndefined();
    expect(result.current.groups).toEqual([]);
  });
});

describe('parity — 같은 응답이면 상세 묶음 = 홈 항목 중 그 모집 몫의 묶음', () => {
  it.each([
    ['진행 중 + 면접(라운드 ASSIGNING·COLLECTING·SCHEDULED, 대기열 2명)', recruitment()],
    ['진행 중 + 면접 안 씀', recruitment({ useInterview: false })],
    ['마감 자체 폼 + 면접 사용', recruitment(CLOSED)],
  ])('%s', async (_name, target) => {
    scenario(target, statsBody({ interviewPending: target.status === 'CLOSED' ? 4 : 3 }));
    const { result } = renderHook(
      () => ({ home: useClubActionItems(CLUB_ID), detail: useRecruitmentActionItems(target) }),
      { wrapper: makeWrapper(newQueryClient()) },
    );
    await waitFor(() => {
      expect(result.current.home.isLoading).toBe(false);
      expect(result.current.detail.isLoading).toBe(false);
    });
    const homeGroups = groupDashboardTasks(result.current.home.items.filter((item) => item.recruitmentId === RECRUITMENT_ID), []);
    expect(result.current.detail.groups.length).toBeGreaterThan(0);
    expect(result.current.detail.groups).toEqual(homeGroups);
    if (target.status === 'CLOSED' || !target.useInterview) {
      expect(calls).toEqual({ rounds: 0, candidatesDecided: 0, candidatesUndecided: 0 });
    }
  });
});
