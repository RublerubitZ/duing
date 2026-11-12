import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { interviewRoundKeys } from '../src/interviewRoundQueryKeys';
import { statsQueryKeys } from '../src/statsQueryKeys';
import {
  useInterviewRoundsQuery,
  useInterviewRoundCandidatesQuery,
  useCreateInterviewRoundMutation,
  useCancelInterviewRoundMutation,
  useCreateRoundSlotsMutation,
  useRequestAvailabilityMutation,
  useRoundAutoAssignMutation,
  useConfirmRoundMutation,
  useExcludeMemberMutation,
  useAssignMemberScheduleMutation,
  useInterviewRoundDetailQuery,
} from '../src/interviewRound';
import { useRecruitmentStatsDailyQuery, useRecruitmentStatsSummaryQuery } from '../src/stats';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe('interviewRoundKeys.candidates', () => {
  it('두 번째 인자를 생략한 키는 전달한 키의 prefix 와 모양이 같다 — prefix 무효화 계약', () => {
    // 시드·단언이 함께 움직여도 못 깨지도록 기대 모양을 직접 적는다. 팩토리가 인자 생략 시에도
    // includeUndecided 를 붙이도록 변형되면 라운드 mutation 의 prefix 무효화가 토글별 캐시에
    // 닿지 않아 후보 목록이 조용히 stale 해진다.
    expect(interviewRoundKeys.candidates(10)).toEqual(['interview-rounds', 'candidates', 10]);
    expect(interviewRoundKeys.candidates(10, false)).toEqual([
      'interview-rounds',
      'candidates',
      10,
      false,
    ]);
  });
});

describe('useInterviewRoundsQuery — refetchOnMount 옵션', () => {
  it("신선한 캐시면 기본은 마운트 때 다시 받지 않고, refetchOnMount: 'always' 를 넘기면 다시 받는다", async () => {
    let listRequestCount = 0;
    server.use(
      http.get('*/leader/recruitments/10/interview-rounds', () => {
        listRequestCount += 1;
        return HttpResponse.json({ ok: true, data: [], message: null });
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
    });
    queryClient.setQueryData(interviewRoundKeys.list(10), []);
    const wrapper = makeWrapper(queryClient);

    const defaultMount = renderHook(() => useInterviewRoundsQuery(10), { wrapper });
    expect(defaultMount.result.current.isFetching).toBe(false);
    defaultMount.unmount();

    const alwaysMount = renderHook(() => useInterviewRoundsQuery(10, { refetchOnMount: 'always' }), { wrapper });
    expect(alwaysMount.result.current.isFetching).toBe(true);
    await waitFor(() => expect(alwaysMount.result.current.isFetchedAfterMount).toBe(true));
    expect(listRequestCount).toBe(1);
  });
});

describe('useCreateInterviewRoundMutation (스펙 §10.1)', () => {
  it('성공 시 list + candidates queryKey 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/recruitments/10/interview-rounds', () =>
        HttpResponse.json({
          ok: true,
          data: { roundId: 42 },
          message: null,
        }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.list(10), []);
    queryClient.setQueryData(interviewRoundKeys.candidates(10), []);
    // 비대상 — detail 은 create 에서 invalidate 안 됨
    queryClient.setQueryData(interviewRoundKeys.detail(42), null);

    const { result } = renderHook(() => useCreateInterviewRoundMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({
      title: '1차 면접',
      applicationIds: [1, 2],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(true);
    // 비대상: detail 은 create 단계에서 invalidate 안 함
    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(false);
  });

  it('대기열을 보는 화면이 없어도 성공 직후 대기열을 다시 받는다 — 홈이 낡은 대기열로 생성 필요를 겹쳐 내지 않게', async () => {
    const queryClient = newQueryClient();
    let candidatesRequestCount = 0;
    let roundCreated = false;
    const queuedCandidates = [31, 32, 33].map((applicationId) => ({
      applicationId,
      userId: applicationId + 100,
      userName: `지원자${applicationId}`,
      studentId: `2025${applicationId}`,
      college: 'IT_ENGINEERING',
      major: '컴퓨터공학과',
      grade: 'SOPHOMORE',
      status: 'INTERVIEW_PENDING',
      submittedAt: '2026-06-05T01:00:00Z',
    }));
    server.use(
      http.get('*/leader/recruitments/10/interview-round-candidates', () => {
        candidatesRequestCount += 1;
        return HttpResponse.json({ ok: true, data: roundCreated ? [] : queuedCandidates, message: null });
      }),
      http.post('*/leader/recruitments/10/interview-rounds', () => {
        roundCreated = true;
        return HttpResponse.json({ ok: true, data: { roundId: 42 }, message: null });
      }),
    );

    // 마법사 1단계처럼 대기열을 한 번 받고 떠난다 — 라운드를 만드는 2단계에는 대기열을 보는 곳이 없다.
    const queueView = renderHook(() => useInterviewRoundCandidatesQuery(10, false), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(queueView.result.current.isSuccess).toBe(true));
    queueView.unmount();

    const { result } = renderHook(() => useCreateInterviewRoundMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({ title: '2차 면접', applicationIds: [31, 32, 33] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() => expect(candidatesRequestCount).toBe(2));
    await waitFor(() => expect(queryClient.getQueryData(interviewRoundKeys.candidates(10, false))).toEqual([]));
  });

  it('통계를 보는 화면이 없어도 성공 직후 통계 요약을 다시 받는다(일별은 낡음 표시만) — 홈이 면접 대상이 된 사람을 검토 대기로 겹쳐 내지 않게', async () => {
    const queryClient = newQueryClient();
    let statsSummaryRequestCount = 0;
    let statsDailyRequestCount = 0;
    server.use(
      http.get('*/leader/recruitments/10/stats/summary', () => {
        statsSummaryRequestCount += 1;
        return HttpResponse.json({
          ok: true,
          data: { total: 3, submitted: 2, onHold: 0, interviewPending: 1, accepted: 0, rejected: 0, capacity: 5, ratio: 0.6 },
          message: null,
        });
      }),
      http.get('*/leader/recruitments/10/stats/daily', () => {
        statsDailyRequestCount += 1;
        return HttpResponse.json({ ok: true, data: [{ date: '2026-11-04', submittedCount: 3 }], message: null });
      }),
      http.post('*/leader/recruitments/10/interview-rounds', () =>
        HttpResponse.json({ ok: true, data: { roundId: 42 }, message: null }),
      ),
    );

    // 홈처럼 통계를 한 번 받고 떠난다 — 라운드를 만드는 마법사에는 통계를 보는 곳이 없다.
    const statsView = renderHook(() => useRecruitmentStatsSummaryQuery(10), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(statsView.result.current.isSuccess).toBe(true));
    statsView.unmount();
    // 통계 화면에서 본 일별 통계 — 홈은 일별을 읽지 않는다.
    const dailyView = renderHook(() => useRecruitmentStatsDailyQuery(10), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(dailyView.result.current.isSuccess).toBe(true));
    dailyView.unmount();

    const { result } = renderHook(() => useCreateInterviewRoundMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({ title: '2차 면접', applicationIds: [31, 32] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() => expect(statsSummaryRequestCount).toBe(2));
    // 받는 중인 요청이 모두 끝난 뒤에도 일별은 처음 한 번뿐이고 낡음 표시만 남는다.
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(statsDailyRequestCount).toBe(1);
    expect(queryClient.getQueryState(statsQueryKeys.daily(10))?.isInvalidated).toBe(true);
  });

  it('통계 요약을 보는 화면이 떠 있으면 무효화가 다시 받은 한 번으로 끝난다 — 받는 중인 요약을 끊고 겹쳐 받지 않게', async () => {
    const queryClient = newQueryClient();
    let statsSummaryRequestCount = 0;
    server.use(
      http.get('*/leader/recruitments/10/stats/summary', () => {
        statsSummaryRequestCount += 1;
        return HttpResponse.json({
          ok: true,
          data: { total: 3, submitted: 2, onHold: 0, interviewPending: 1, accepted: 0, rejected: 0, capacity: 5, ratio: 0.6 },
          message: null,
        });
      }),
      http.post('*/leader/recruitments/10/interview-rounds', () =>
        HttpResponse.json({ ok: true, data: { roundId: 42 }, message: null }),
      ),
    );

    // 요약을 보는 화면을 띄운 채로 라운드를 만든다.
    const statsView = renderHook(() => useRecruitmentStatsSummaryQuery(10), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(statsView.result.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useCreateInterviewRoundMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({ title: '2차 면접', applicationIds: [31, 32] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(statsSummaryRequestCount).toBe(2);
    statsView.unmount();
  });
});

describe('useCancelInterviewRoundMutation (스펙 §10.1 — 재큐잉)', () => {
  it('성공 시 detail + list + candidates queryKey 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/cancel', () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.list(10), []);
    queryClient.setQueryData(interviewRoundKeys.candidates(10), []);
    // 취소된 라운드 dashboard 가 stale 상태로 남지 않도록 detail 도 invalidate 대상
    queryClient.setQueryData(interviewRoundKeys.detail(42), null);
    // 진행 중 라운드가 없어지면 모집의 자동 마감 전망(통계 요약)이 바뀐다(#1572).
    queryClient.setQueryData(statsQueryKeys.summary(10), null);

    const { result } = renderHook(() => useCancelInterviewRoundMutation(10, 42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(statsQueryKeys.summary(10))?.isInvalidated).toBe(true);
  });
});

describe('useCreateRoundSlotsMutation (슬롯 추가 → 가능 시간 없음 멤버 재초대)', () => {
  it('재초대가 있으면 detail + 라운드 목록이 invalidate 된다 — 모집 id 를 몰라 모든 모집 목록을 낡게 하고 candidates 는 유지된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/slots', () =>
        HttpResponse.json({
          ok: true,
          data: { createdSlotIds: [501], reinvitedMemberCount: 1 },
          message: null,
        }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.detail(42), null);
    queryClient.setQueryData(interviewRoundKeys.list(10), []);
    // 다른 모집 목록 — 훅이 모집 id 를 몰라 접두로 걸기 때문에 함께 낡는다.
    queryClient.setQueryData(interviewRoundKeys.list(11), []);
    queryClient.setQueryData(interviewRoundKeys.candidates(10), []);

    const { result } = renderHook(() => useCreateRoundSlotsMutation(42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({
      slots: [{ startTime: '2026-11-10T10:00:00', endTime: '2026-11-10T10:30:00', capacity: 1 }],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.list(11))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    // 비대상: 슬롯 추가는 대기열을 바꾸지 않는다
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(false);
  });

  it('재초대가 없으면 detail 만 invalidate 되고 라운드 목록은 유지된다 — 목록을 보는 마법사 3단계가 헛되이 다시 받지 않게', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/slots', () =>
        HttpResponse.json({
          ok: true,
          data: { createdSlotIds: [501], reinvitedMemberCount: 0 },
          message: null,
        }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.detail(42), null);
    queryClient.setQueryData(interviewRoundKeys.list(10), []);

    const { result } = renderHook(() => useCreateRoundSlotsMutation(42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({
      slots: [{ startTime: '2026-11-10T10:00:00', endTime: '2026-11-10T10:30:00', capacity: 1 }],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(false);
  });
});

describe('useRequestAvailabilityMutation (스펙 §10.1 — 발송: DRAFT → COLLECTING)', () => {
  it('성공 시 detail + list queryKey 가 invalidate 된다 — 발송 뒤 홈이 초안 줄을 띄우지 않게', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/request-availability', () =>
        HttpResponse.json({ ok: true, data: { notifiedMemberCount: 3 }, message: null }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.detail(42), null);
    queryClient.setQueryData(interviewRoundKeys.list(10), []);

    const { result } = renderHook(() => useRequestAvailabilityMutation(10, 42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(true);
  });
});

describe('useRoundAutoAssignMutation (스펙 §10.1 — 자동 배정: COLLECTING → ASSIGNING)', () => {
  it('성공 시 detail + list queryKey 가 invalidate 된다 — 배정 뒤 홈이 자동 배정 줄을 남기지 않게', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/auto-assign', () =>
        HttpResponse.json({
          ok: true,
          data: { assignedMemberCount: 2, unassignedMemberCount: 1 },
          message: null,
        }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.detail(42), null);
    queryClient.setQueryData(interviewRoundKeys.list(10), []);

    const { result } = renderHook(() => useRoundAutoAssignMutation(10, 42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(true);
  });
});

describe('useConfirmRoundMutation (스펙 §10.1 — 확정 시 재큐잉 포함)', () => {
  it('성공 시 detail + list + candidates queryKey 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/confirm', () =>
        HttpResponse.json({
          ok: true,
          data: { assignedMemberCount: 4, excludedMemberCount: 1 },
          message: null,
        }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.detail(42), null);
    queryClient.setQueryData(interviewRoundKeys.list(10), []);
    queryClient.setQueryData(interviewRoundKeys.candidates(10), []);
    queryClient.setQueryData(statsQueryKeys.summary(10), null);

    const { result } = renderHook(() => useConfirmRoundMutation(10, 42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate(false);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(statsQueryKeys.summary(10))?.isInvalidated).toBe(true);
  });

  it.each<[number, string, boolean]>([
    [409, 'detail queryKey 가 invalidate 된다 — 화면의 상세가 낡았다는 신호', true],
    [500, 'detail queryKey 는 유지된다', false],
  ])('%i 응답으로 실패하면 %s', async (status, _label, invalidated) => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/confirm', () =>
        HttpResponse.json({ ok: false, data: null, message: '확정할 수 없습니다.' }, { status }),
      ),
    );
    queryClient.setQueryData(interviewRoundKeys.detail(42), null);

    const { result } = renderHook(() => useConfirmRoundMutation(10, 42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate(false);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(invalidated);
  });
});

describe('useExcludeMemberMutation (스펙 §10.1 — 제외 시 재큐잉)', () => {
  it('성공 시 detail + list + candidates queryKey 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/members/7/exclude', () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.detail(42), null);
    queryClient.setQueryData(interviewRoundKeys.list(10), []);
    queryClient.setQueryData(interviewRoundKeys.candidates(10), []);
    // 자동 마감 전망은 결과를 기다리는 사람이 남은 라운드만 센다 — 기다리던 마지막 멤버를 빼면 통계 요약이 바뀐다.
    queryClient.setQueryData(statsQueryKeys.summary(10), null);

    const { result } = renderHook(() => useExcludeMemberMutation(10, 42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(statsQueryKeys.summary(10))?.isInvalidated).toBe(true);
  });

  it.each<[number, string, boolean]>([
    [409, 'detail queryKey 만 invalidate 된다 — 화면의 상세가 낡았다는 신호', true],
    [500, 'detail queryKey 도 유지된다', false],
  ])('%i 응답으로 실패하면 %s', async (status, _label, invalidated) => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/members/7/exclude', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '현재 상태에서 허용되지 않는 멤버 상태 변경입니다.' },
          { status },
        ),
      ),
    );
    queryClient.setQueryData(interviewRoundKeys.detail(42), null);
    queryClient.setQueryData(interviewRoundKeys.list(10), []);
    queryClient.setQueryData(interviewRoundKeys.candidates(10), []);
    queryClient.setQueryData(statsQueryKeys.summary(10), null);

    const { result } = renderHook(() => useExcludeMemberMutation(10, 42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate(7);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(invalidated);
    // 목록·후보·통계를 낡게 만든 건 이 409 가 아니라 다른 운영진의 동작이다 — 상세만 다시 받는다.
    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(statsQueryKeys.summary(10))?.isInvalidated).toBe(false);
  });
});

describe('useAssignMemberScheduleMutation (스펙 §10.1 — 배정 detail 만)', () => {
  it('성공 시 detail queryKey 만 invalidate 되고 list·candidates 는 유지된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.put('*/leader/interview-rounds/42/members/7/schedule', () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.detail(42), null);
    queryClient.setQueryData(interviewRoundKeys.list(10), []);
    queryClient.setQueryData(interviewRoundKeys.candidates(10), []);

    const { result } = renderHook(() => useAssignMemberScheduleMutation(42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({ memberId: 7, slotId: 99, expectedRoundStatus: 'ASSIGNING' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    // 비대상: list·candidates 는 수동 배정에서 invalidate 안 함
    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(false);
  });

  it.each<[number, string, boolean]>([
    [409, 'detail queryKey 가 invalidate 된다 — 화면의 상세가 낡았다는 신호', true],
    [400, 'detail queryKey 가 invalidate 된다 — 고른 슬롯이 그사이 지워졌다는 신호(InvalidSlotSelection)', true],
    [500, 'detail queryKey 는 유지된다', false],
  ])('%i 응답으로 실패하면 %s', async (status, _label, invalidated) => {
    const queryClient = newQueryClient();
    server.use(
      http.put('*/leader/interview-rounds/42/members/7/schedule', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '현재 상태에서 허용되지 않는 멤버 상태 변경입니다.' },
          { status },
        ),
      ),
    );
    queryClient.setQueryData(interviewRoundKeys.detail(42), null);

    const { result } = renderHook(() => useAssignMemberScheduleMutation(42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({ memberId: 7, slotId: 99, expectedRoundStatus: 'ASSIGNING' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(invalidated);
  });

  it('409 로 실패하면 상세 재조회를 기다리지 않고 바로 오류가 된다', async () => {
    const queryClient = newQueryClient();
    let releaseRefetch: () => void = () => {};
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    let detailGetCount = 0;
    server.use(
      http.get('*/leader/interview-rounds/42', async () => {
        detailGetCount += 1;
        if (detailGetCount > 1) await refetchGate;
        return HttpResponse.json({ ok: true, data: { roundId: 42 }, message: null });
      }),
      http.put('*/leader/interview-rounds/42/members/7/schedule', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '현재 상태에서 허용되지 않는 멤버 상태 변경입니다.' },
          { status: 409 },
        ),
      ),
    );

    try {
      // 상세를 지켜보는 쪽이 있어야 무효화가 실제 재조회를 띄운다(화면과 같은 조건).
      const { result } = renderHook(
        () => ({
          detail: useInterviewRoundDetailQuery(42),
          assign: useAssignMemberScheduleMutation(42),
        }),
        { wrapper: makeWrapper(queryClient) },
      );
      await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

      result.current.assign.mutate({ memberId: 7, slotId: 99, expectedRoundStatus: 'ASSIGNING' });

      // 재조회를 붙잡은 동안 — onError 가 무효화를 돌려주면(return) 오류 기록이 재조회 뒤로 밀려 여기서 시간 초과한다.
      await waitFor(() => expect(result.current.assign.isError).toBe(true));
      expect(detailGetCount).toBe(2);
      expect(result.current.detail.isFetching).toBe(true);
    } finally {
      releaseRefetch();
    }
  });
});
