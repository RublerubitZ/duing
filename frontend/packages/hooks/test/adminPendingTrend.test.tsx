import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import type { AdminPendingTrend, AdminPendingTrendDay } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { useAdminPendingTrendQuery } from '../src/admin';
import { adminQueryKeys } from '../src/adminQueryKeys';
import { buildPendingTrendBars, pendingTrendComparison, recordedDayCount } from '../src/adminPendingTrend';
import { addDaysIso } from '../src/calendarMonth';

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

/** 10/17 ~ 10/29 13일 — totals[i] 가 그날 값(null = 기록 없음). */
function daysOf(totals: Array<number | null>): AdminPendingTrendDay[] {
  return totals.map((totalPendingCount, index) => ({ date: addDaysIso('2026-10-17', index), totalPendingCount }));
}

const TREND: AdminPendingTrend = {
  days: daysOf([18, 20, null, 22, 24, 21, 23, 25, 24, 26, 27, 25, 26]),
  recentFlow: { days: 7, receivedCount: 31, handledCount: 27 },
};

const server = setupServer(
  http.get('http://localhost:8080/api/v1/admin/pending-trend', () => HttpResponse.json({ ok: true, message: null, data: TREND })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useAdminPendingTrendQuery', () => {
  it('GET /admin/pending-trend 응답을 pendingCounts 접두 아래 키로 캐시한다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAdminPendingTrendQuery(), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(result.current.data).toEqual(TREND));
    expect(adminQueryKeys.pendingTrend().slice(0, 2)).toEqual([...adminQueryKeys.pendingCounts()]);
    expect(queryClient.getQueryData(adminQueryKeys.pendingTrend())).toEqual(TREND);
  });

  it('처리 뮤테이션이 하는 pendingCounts 무효화가 추이도 무효로 만든다', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(adminQueryKeys.pendingTrend(), TREND);
    await queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
    expect(queryClient.getQueryState(adminQueryKeys.pendingTrend())?.isInvalidated).toBe(true);
  });

  it('추이를 캐시해도 pendingCounts 데이터는 그대로다 — 접두만 공유하고 값은 섞이지 않는다', () => {
    const queryClient = new QueryClient();
    const pendingCounts = { totalPendingCount: 3 };
    queryClient.setQueryData(adminQueryKeys.pendingCounts(), pendingCounts);
    queryClient.setQueryData(adminQueryKeys.pendingTrend(), TREND);
    expect(queryClient.getQueryData(adminQueryKeys.pendingCounts())).toEqual(pendingCounts);
  });
});

describe('buildPendingTrendBars', () => {
  it('지난 13일 + 오늘 = 14개, 오늘 날짜는 마지막 날 + 1일이다', () => {
    const bars = buildPendingTrendBars(TREND.days, 28);
    expect(bars).toHaveLength(14);
    expect(bars.at(-1)).toEqual({ date: '2026-10-30', isToday: true, kind: 'value', value: 28 });
    expect(bars.slice(0, 13).every((bar) => !bar.isToday)).toBe(true);
  });

  it('기록 없음(null)과 0건을 다른 막대로 만든다', () => {
    const bars = buildPendingTrendBars(daysOf([0, null, ...Array<number>(11).fill(1)]), 1);
    expect(bars[0]).toEqual({ date: '2026-10-17', isToday: false, kind: 'value', value: 0 });
    expect(bars[1]).toEqual({ date: '2026-10-18', isToday: false, kind: 'missing' });
  });

  it('오늘 값을 못 불러왔으면(null) 오늘 막대는 unavailable 이다 — 기록 없음과 다르다', () => {
    const bars = buildPendingTrendBars(TREND.days, null);
    expect(bars.at(-1)).toEqual({ date: '2026-10-30', isToday: true, kind: 'unavailable' });
  });

  it('응답 날짜가 비면 오늘 날짜를 만들 수 없어 막대도 없다', () => {
    expect(buildPendingTrendBars([], 3)).toEqual([]);
  });
});

describe('recordedDayCount', () => {
  it('저장값이 있는 지난날 수만 센다 — 0 은 기록이다', () => {
    expect(recordedDayCount(daysOf([0, null, null, ...Array<null>(10).fill(null)]))).toBe(1);
    expect(recordedDayCount(TREND.days)).toBe(12);
  });
});

describe('pendingTrendComparison', () => {
  it('기록이 있는 첫 막대와 오늘 막대를 비교한다', () => {
    const comparison = pendingTrendComparison(buildPendingTrendBars(TREND.days, 28));
    expect(comparison).toEqual({
      from: { date: '2026-10-17', value: 18 },
      to: { date: '2026-10-30', value: 28, isToday: true },
    });
  });

  it('첫날이 기록 없음이면 기록이 있는 첫날부터 센다', () => {
    const comparison = pendingTrendComparison(buildPendingTrendBars(daysOf([null, 5, ...Array<number>(11).fill(6)]), 7));
    expect(comparison?.from).toEqual({ date: '2026-10-18', value: 5 });
  });

  it('오늘을 못 불러왔으면 마지막 기록일이 비교 기준이다', () => {
    const comparison = pendingTrendComparison(buildPendingTrendBars(TREND.days, null));
    expect(comparison?.to).toEqual({ date: '2026-10-29', value: 26, isToday: false });
  });

  it('값 막대가 2개 미만이면 비교하지 않는다', () => {
    expect(pendingTrendComparison(buildPendingTrendBars(daysOf(Array<null>(13).fill(null)), 4))).toBeNull();
  });
});
