import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useStopRecruitmentIntakeMutation, useUpdateRecruitmentMutation } from '../src/recruitments';
import { statsQueryKeys } from '../src/statsQueryKeys';

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

// 모집 기간이 바뀌면 통계 요약의 자동 마감 전망(만료 여부·자동 마감 날짜)도 바뀐다(#1572).
describe('모집 기간을 바꾸는 mutation 은 통계 요약을 다시 받게 한다', () => {
  it('모집 수정이 성공하면 이 모집의 통계가 무효화된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.patch('*/leader/recruitments/10', () => HttpResponse.json({ ok: true, data: null, message: null })),
    );
    queryClient.setQueryData(statsQueryKeys.summary(10), null);

    const { result } = renderHook(() => useUpdateRecruitmentMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({ endDate: '2026-12-31' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(statsQueryKeys.summary(10))?.isInvalidated).toBe(true);
  });

  it('접수 마감이 성공하면 이 모집의 통계가 무효화된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.patch('*/leader/recruitments/10/stop-intake', () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );
    queryClient.setQueryData(statsQueryKeys.summary(10), null);

    const { result } = renderHook(() => useStopRecruitmentIntakeMutation(10, 1), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(statsQueryKeys.summary(10))?.isInvalidated).toBe(true);
  });
});
