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
const ROUND_ID = 7;
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

// 두 모집 몫을 미리 채워 두고, mutation 뒤 이 모집 몫에만 무효화 표시가 붙는지 본다(라운드 생성은 보는 화면이 없어도 대기열('all')과 통계 요약('inactive')을 다시 받지만, 시드에는 queryFn 이 없어 그 요청은 조용히 실패하고 무효화 표시만 남는다).
function seededQueryClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const recruitmentId of [RECRUITMENT_ID, OTHER_RECRUITMENT_ID]) {
    for (const queryKey of consumerKeys(recruitmentId)) queryClient.setQueryData(queryKey, []);
  }
  // 결과를 정하면 그 멤버가 진행 중 라운드에서 빠져 인원·응답 수가 바뀐다(백엔드 짝) — 이 모집 라운드 목록·라운드 상세는 낡고 다른 모집 목록은 그대로인지 본다.
  queryClient.setQueryData(interviewRoundKeys.list(RECRUITMENT_ID), []);
  queryClient.setQueryData(interviewRoundKeys.list(OTHER_RECRUITMENT_ID), []);
  queryClient.setQueryData(interviewRoundKeys.detail(ROUND_ID), null);
  // 일괄 대상(31·32)과 대상이 아닌 지원서(33)의 상세 — 일괄 뒤 바꾼 지원서 상세만 낡는지 본다.
  for (const applicationId of [31, 32, 33]) queryClient.setQueryData(applicationQueryKeys.applicantDetail(applicationId), null);
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
  it('지원 하나를 합격으로 정하면 면접 대기열(토글 두 엔트리)·통계·지원자 목록·라운드 목록·상세가 낡는다 — 다른 모집은 그대로', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useUpdateApplicationStatusMutation(RECRUITMENT_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ applicationId: 31, payload: { status: 'ACCEPTED' } }));
    expect(invalidatedKeys(queryClient, RECRUITMENT_ID)).toEqual(consumerKeys(RECRUITMENT_ID));
    expect(invalidatedKeys(queryClient, OTHER_RECRUITMENT_ID)).toEqual([]);
    expect(queryClient.getQueryState(interviewRoundKeys.list(RECRUITMENT_ID))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.list(OTHER_RECRUITMENT_ID))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(interviewRoundKeys.detail(ROUND_ID))?.isInvalidated).toBe(true);
  });

  it('지원 하나를 불합격으로 정해도 라운드 목록·상세가 낡는다', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useUpdateApplicationStatusMutation(RECRUITMENT_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ applicationId: 31, payload: { status: 'REJECTED' } }));
    expect(queryClient.getQueryState(interviewRoundKeys.list(RECRUITMENT_ID))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.detail(ROUND_ID))?.isInvalidated).toBe(true);
  });

  it('지원 하나를 보류로 바꾸면(결과가 아닌 변경) 라운드 목록·상세는 그대로다', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useUpdateApplicationStatusMutation(RECRUITMENT_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ applicationId: 31, payload: { status: 'ON_HOLD' } }));
    expect(queryClient.getQueryState(interviewRoundKeys.list(RECRUITMENT_ID))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(interviewRoundKeys.detail(ROUND_ID))?.isInvalidated).toBe(false);
  });

  it('일괄 "면접 대상으로 선정"도 면접 대기열·통계·지원자 목록·바꾼 지원서 상세를 낡게 한다 — 결과가 아니라 라운드는 그대로', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useBulkUpdateApplicationStatusMutation(RECRUITMENT_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ applicationIds: [31, 32], status: 'INTERVIEW_PENDING' }));
    expect(invalidatedKeys(queryClient, RECRUITMENT_ID)).toEqual(consumerKeys(RECRUITMENT_ID));
    expect(invalidatedKeys(queryClient, OTHER_RECRUITMENT_ID)).toEqual([]);
    expect(queryClient.getQueryState(interviewRoundKeys.list(RECRUITMENT_ID))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(interviewRoundKeys.detail(ROUND_ID))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(applicationQueryKeys.applicantDetail(31))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(applicationQueryKeys.applicantDetail(32))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(applicationQueryKeys.applicantDetail(33))?.isInvalidated).toBe(false);
  });

  it('일괄 불합격(결과 확정)은 바꾼 지원서 상세와 이 모집 라운드 목록·라운드 상세도 낡게 한다 — 대상 아닌 상세·다른 모집 목록은 그대로', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useBulkUpdateApplicationStatusMutation(RECRUITMENT_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ applicationIds: [31, 32], status: 'REJECTED' }));
    expect(queryClient.getQueryState(applicationQueryKeys.applicantDetail(31))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(applicationQueryKeys.applicantDetail(32))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(applicationQueryKeys.applicantDetail(33))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(interviewRoundKeys.list(RECRUITMENT_ID))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.detail(ROUND_ID))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.list(OTHER_RECRUITMENT_ID))?.isInvalidated).toBe(false);
  });

  it('일괄 합격도 이 모집 라운드 목록·라운드 상세를 낡게 한다', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useBulkUpdateApplicationStatusMutation(RECRUITMENT_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ applicationIds: [31, 32], status: 'ACCEPTED' }));
    expect(queryClient.getQueryState(interviewRoundKeys.list(RECRUITMENT_ID))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.detail(ROUND_ID))?.isInvalidated).toBe(true);
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
