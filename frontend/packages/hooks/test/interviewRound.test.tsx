import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { interviewRoundKeys } from '../src/interviewRoundQueryKeys';
import {
  useCreateInterviewRoundMutation,
  useCancelInterviewRoundMutation,
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
});

describe('useCancelInterviewRoundMutation (스펙 §10.1 — 재큐잉)', () => {
  it('성공 시 list + candidates queryKey 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/leader/interview-rounds/42/cancel', () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.list(10), []);
    queryClient.setQueryData(interviewRoundKeys.candidates(10), []);
    // 비대상 — detail 은 cancel 에서 invalidate 안 됨
    queryClient.setQueryData(interviewRoundKeys.detail(42), null);

    const { result } = renderHook(() => useCancelInterviewRoundMutation(10, 42), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.list(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewRoundKeys.candidates(10))?.isInvalidated).toBe(true);
    // 비대상: detail 은 cancel 단계에서 invalidate 안 함
    expect(queryClient.getQueryState(interviewRoundKeys.detail(42))?.isInvalidated).toBe(false);
  });
});
