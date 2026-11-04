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
  useInterviewRoundCandidatesQuery,
  useCreateInterviewRoundMutation,
  useCancelInterviewRoundMutation,
  useConfirmRoundMutation,
  useExcludeMemberMutation,
  useAssignMemberScheduleMutation,
} from '../src/interviewRound';

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

    const { result } = renderHook(() => useExcludeMemberMutation(10, 42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(true);
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
    result.current.mutate({ memberId: 7, slotId: 99 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(true);
    // 비대상: list·candidates 는 수동 배정에서 invalidate 안 함
    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(false);
  });
});
