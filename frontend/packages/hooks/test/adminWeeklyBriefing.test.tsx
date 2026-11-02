import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useAdminWeeklyBriefingQuery } from '../src/adminWeeklyBriefing';
import { adminQueryKeys } from '../src/adminQueryKeys';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const requestedWeeks: string[] = [];

const server = setupServer(
  http.get('*/admin/weekly-briefing', ({ request }) => {
    const weekStart = new URL(request.url).searchParams.get('weekStart') ?? '';
    requestedWeeks.push(weekStart);
    if (weekStart === '2026-11-02') {
      return HttpResponse.json({ ok: false, message: '아직 끝나지 않은 주입니다.', data: null, code: 'WEEK_NOT_ENDED' }, { status: 400 });
    }
    return HttpResponse.json({ ok: true, message: null, data: { federationNoticeCount: 1 } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  requestedWeeks.length = 0;
});
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

const observerOptions = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.getQueryCache().find({ queryKey })?.observers[0]?.options;

describe('useAdminWeeklyBriefingQuery', () => {
  it('주마다 다른 키로 받고, 키는 처리 대기 건수 접두 밖이다 — 처리 뮤테이션의 대기 건수 무효화에 끌려가지 않는다', async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAdminWeeklyBriefingQuery('2026-10-26'), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestedWeeks).toEqual(['2026-10-26']);
    expect(adminQueryKeys.weeklyBriefing('2026-10-26')).toEqual(['admin', 'weekly-briefing', '2026-10-26']);
    expect(adminQueryKeys.weeklyBriefing('2026-10-26')[1]).not.toBe(adminQueryKeys.pendingCounts()[1]);
  });

  it('가장 최근 주는 staleTime 0, 다른 주는 앱 기본값을 그대로 쓰고, 어느 쪽도 이전 데이터를 자리 채움으로 두지 않는다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    const wrapper = makeWrapper(queryClient);
    const latest = renderHook(() => useAdminWeeklyBriefingQuery('2026-10-26', { isLatestWeek: true }), { wrapper });
    const older = renderHook(() => useAdminWeeklyBriefingQuery('2026-10-19'), { wrapper });

    await waitFor(() => expect(latest.result.current.isSuccess && older.result.current.isSuccess).toBe(true));
    expect(observerOptions(queryClient, adminQueryKeys.weeklyBriefing('2026-10-26'))?.staleTime).toBe(0);
    expect(observerOptions(queryClient, adminQueryKeys.weeklyBriefing('2026-10-19'))?.staleTime).toBe(30_000);
    expect(observerOptions(queryClient, adminQueryKeys.weeklyBriefing('2026-10-26'))?.placeholderData).toBeUndefined();
    expect(observerOptions(queryClient, adminQueryKeys.weeklyBriefing('2026-10-19'))?.placeholderData).toBeUndefined();
  });

  it('주 범위 밖 400 은 다시 받지 않고 code 를 그대로 넘긴다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
    const { result } = renderHook(() => useAdminWeeklyBriefingQuery('2026-11-02'), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(requestedWeeks).toEqual(['2026-11-02']);
    expect(result.current.error).toMatchObject({ status: 400, code: 'WEEK_NOT_ENDED' });
  });

  it('enabled 가 false 면 요청하지 않는다(가장 이른 주의 전 주)', async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAdminWeeklyBriefingQuery('2025-10-27', { enabled: false }), {
      wrapper: makeWrapper(queryClient),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(requestedWeeks).toEqual([]);
  });
});
