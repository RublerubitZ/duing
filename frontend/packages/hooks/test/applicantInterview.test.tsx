import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { interviewRoundKeys } from '../src/interviewRoundQueryKeys';
import { applicationQueryKeys } from '../src/applicationQueryKeys';
import { useRespondAvailabilityMutation } from '../src/applicantInterview';

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

describe('useRespondAvailabilityMutation (스펙 §10.1)', () => {
  it('응답 성공 시 myInterview + myDetail queryKey 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.put('*/applications/42/interview-availability', () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    queryClient.setQueryData(interviewRoundKeys.myInterview(42), null);
    queryClient.setQueryData(applicationQueryKeys.myDetail(42), null);
    // 비대상 — 다른 applicationId 의 캐시는 invalidate 안 됨
    queryClient.setQueryData(interviewRoundKeys.myInterview(99), null);

    const { result } = renderHook(() => useRespondAvailabilityMutation(42), {
      wrapper: makeWrapper(queryClient),
    });

    result.current.mutate({ slotIds: [1, 2] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewRoundKeys.myInterview(42))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(applicationQueryKeys.myDetail(42))?.isInvalidated).toBe(true);
    // 비대상: 다른 applicationId 는 invalidate 안 함
    expect(queryClient.getQueryState(interviewRoundKeys.myInterview(99))?.isInvalidated).toBe(false);
  });
});
