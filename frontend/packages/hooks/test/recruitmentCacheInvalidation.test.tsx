import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { applicationQueryKeys } from '../src/applicationQueryKeys';
import { useBulkUpdateApplicationStatusMutation, useUpdateApplicationStatusMutation } from '../src/applications';
import { useCreateInterviewRoundMutation } from '../src/interviewRound';
import { interviewRoundKeys } from '../src/interviewRoundQueryKeys';
import { statsQueryKeys } from '../src/statsQueryKeys';

const RECRUITMENT_ID = 1;
const OTHER_RECRUITMENT_ID = 2;
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

// 운영진 홈·모집 상세 할 일 카드·지원자 화면이 읽는 키. 지원 상태가 바뀌면 이 다섯이 모두 낡는다.
function consumerKeys(recruitmentId: number): QueryKey[] {
  return [
    interviewRoundKeys.candidates(recruitmentId, false),
    interviewRoundKeys.candidates(recruitmentId, true),
    statsQueryKeys.summary(recruitmentId),
    applicationQueryKeys.applicants(recruitmentId, { status: 'SUBMITTED' }),
    applicationQueryKeys.applicants(recruitmentId),
  ];
}

// 두 모집 몫을 미리 채워 두고, mutation 뒤 이 모집 몫에만 무효화 표시가 붙는지 본다(관찰자가 없어 재요청은 하지 않는다).
function seededQueryClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const recruitmentId of [RECRUITMENT_ID, OTHER_RECRUITMENT_ID]) {
    for (const queryKey of consumerKeys(recruitmentId)) queryClient.setQueryData(queryKey, []);
  }
  // 라운드 목록은 지원 상태 변경으로 바뀌지 않는다(상태 변경은 라운드 멤버십을 바꾸지 않는다) — 상태 변경 테스트에서 낡지 않았는지 본다.
  queryClient.setQueryData(interviewRoundKeys.list(RECRUITMENT_ID), []);
  return queryClient;
}

function invalidatedKeys(queryClient: QueryClient, recruitmentId: number): QueryKey[] {
  return consumerKeys(recruitmentId).filter((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated === true);
}

const server = setupServer(
  http.patch('*/leader/applications/31/status', () => HttpResponse.json({ ok: true, message: null, data: null })),
  http.patch('*/leader/applications/bulk-status', () =>
    HttpResponse.json({ ok: true, message: null, data: { updated: 2, failures: [] } }),
  ),
  http.post(`*/leader/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
    HttpResponse.json({ ok: true, message: null, data: { roundId: 7 } }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('모집 캐시 무효화 — 지원 상태가 바뀌는 mutation', () => {
  it('지원 상태 하나를 바꾸면 면접 대기열(토글 두 엔트리)·통계·지원자 목록이 낡는다 — 다른 모집은 그대로', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useUpdateApplicationStatusMutation(RECRUITMENT_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ applicationId: 31, payload: { status: 'INTERVIEW_PENDING' } }));
    expect(invalidatedKeys(queryClient, RECRUITMENT_ID)).toEqual(consumerKeys(RECRUITMENT_ID));
    expect(invalidatedKeys(queryClient, OTHER_RECRUITMENT_ID)).toEqual([]);
    expect(queryClient.getQueryState(interviewRoundKeys.list(RECRUITMENT_ID))?.isInvalidated).toBe(false);
  });

  it('일괄 "면접 대상으로 선정"도 면접 대기열·통계·지원자 목록을 낡게 한다', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useBulkUpdateApplicationStatusMutation(RECRUITMENT_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ applicationIds: [31, 32], status: 'INTERVIEW_PENDING' }));
    expect(invalidatedKeys(queryClient, RECRUITMENT_ID)).toEqual(consumerKeys(RECRUITMENT_ID));
    expect(invalidatedKeys(queryClient, OTHER_RECRUITMENT_ID)).toEqual([]);
    expect(queryClient.getQueryState(interviewRoundKeys.list(RECRUITMENT_ID))?.isInvalidated).toBe(false);
  });

  it('면접 라운드를 만들면(지원 완료·보류 → 면접 대상) 통계·지원자 목록도 낡는다', async () => {
    const queryClient = seededQueryClient();
    // 이웃 키 접두는 모든 모집을 덮어 consumerKeys 비교에 넣지 않고 따로 본다.
    queryClient.setQueryData(applicationQueryKeys.applicantNeighbors(RECRUITMENT_ID, 31), { prevApplicationId: null, nextApplicationId: null });
    const { result } = renderHook(() => useCreateInterviewRoundMutation(RECRUITMENT_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ title: '1차 면접', applicationIds: [31] }));
    expect(invalidatedKeys(queryClient, RECRUITMENT_ID)).toEqual(consumerKeys(RECRUITMENT_ID));
    expect(invalidatedKeys(queryClient, OTHER_RECRUITMENT_ID)).toEqual([]);
    expect(queryClient.getQueryState(applicationQueryKeys.applicantNeighbors(RECRUITMENT_ID, 31))?.isInvalidated).toBe(true);
  });
});
