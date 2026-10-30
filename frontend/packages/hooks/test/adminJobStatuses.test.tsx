import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import type { AdminJobStatuses } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { ADMIN_JOB_STATUSES_REFETCH_INTERVAL_MS, useAdminJobStatusesQuery } from '../src/admin';
import { adminQueryKeys } from '../src/adminQueryKeys';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const JOB_STATUSES: AdminJobStatuses = {
  jobs: [
    {
      job: 'RECRUITMENT_AUTO_CLOSE',
      health: 'OK',
      lastFinishedAt: '2026-10-29T15:40:02Z',
      lastSucceededAt: '2026-10-29T15:40:02Z',
      lastOutcome: 'SUCCESS',
      resultCount: 2,
      failedCount: 0,
    },
  ],
};

const server = setupServer(
  http.get('*/admin/job-statuses', () => HttpResponse.json({ ok: true, message: null, data: JOB_STATUSES })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

describe('useAdminJobStatusesQuery', () => {
  it('자동 작업 상태를 받아 온다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAdminJobStatusesQuery(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(JOB_STATUSES);
  });

  it('앱 기본값(포커스 때 안 받음)을 덮어, 포커스·5분 주기로 다시 받는다 — 열어 둔 홈에서도 "늦음"이 나타난다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    const { result } = renderHook(() => useAdminJobStatusesQuery(), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // refetchOnWindowFocus·refetchInterval 은 옵저버 옵션이다(Query.options 타입에는 없다 — typecheck 가 test 까지 본다)
    const observerOptions = queryClient.getQueryCache().find({ queryKey: adminQueryKeys.jobStatuses() })?.observers[0]?.options;
    expect(observerOptions?.refetchOnWindowFocus).toBe(true);
    expect(observerOptions?.refetchInterval).toBe(ADMIN_JOB_STATUSES_REFETCH_INTERVAL_MS);
    expect(ADMIN_JOB_STATUSES_REFETCH_INTERVAL_MS).toBe(300_000);
  });

  it('키가 pending-counts 접두 밖이다 — 처리 뮤테이션의 대기 건수 무효화에 끌려가지 않는다', () => {
    expect(adminQueryKeys.jobStatuses()).toEqual(['admin', 'job-statuses']);
    expect(adminQueryKeys.jobStatuses()[1]).not.toBe(adminQueryKeys.pendingCounts()[1]);
  });
});
