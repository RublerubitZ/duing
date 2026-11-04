import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import {
  useAdminClosingRecruitmentsQuery,
  useAdminWeeklyBriefingQuery,
  useAdminWeeklyFacilityHeatmapQuery,
} from '../src/adminWeeklyBriefing';
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
    if (weekStart === '2026-10-12') {
      // 옛 백엔드(엔드포인트 없음) — 새 프론트만 먼저 나간 롤백 경로
      return HttpResponse.json({ ok: false, message: 'Not Found', data: null }, { status: 404 });
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

  it('옛 백엔드 404 도 다시 받지 않는다 — 구역 실패로 바로 그린다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
    const { result } = renderHook(() => useAdminWeeklyBriefingQuery('2026-10-12'), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(requestedWeeks).toEqual(['2026-10-12']);
    expect(result.current.error).toMatchObject({ status: 404 });
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

describe('useAdminWeeklyFacilityHeatmapQuery·useAdminClosingRecruitmentsQuery', () => {
  let heatmapRequests = 0;
  let closingRequests = 0;
  const useBriefingSideHandlers = () =>
    server.use(
      http.get('*/admin/weekly-briefing/facility-heatmap', () => {
        heatmapRequests += 1;
        return HttpResponse.json({ ok: true, message: null, data: { facilities: [], currentMonthCrawledAt: null } });
      }),
      http.get('*/admin/weekly-briefing/closing-recruitments', () => {
        closingRequests += 1;
        return HttpResponse.json({ ok: true, message: null, data: { weekStart: '2026-11-02', recruitments: [] } });
      }),
    );

  it('히트맵 키는 시설 예약 접두, 이번 주 모집 키는 모집 접두 아래라 승인·강제 마감 뒤 무효화가 이번 주 칸에도 닿는다', async () => {
    heatmapRequests = 0;
    closingRequests = 0;
    useBriefingSideHandlers();
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);
    const heatmap = renderHook(() => useAdminWeeklyFacilityHeatmapQuery('2026-11-02'), { wrapper });
    const closing = renderHook(() => useAdminClosingRecruitmentsQuery(), { wrapper });
    await waitFor(() => expect(heatmap.result.current.isSuccess && closing.result.current.isSuccess).toBe(true));

    expect(adminQueryKeys.weeklyFacilityHeatmap('2026-11-02')).toEqual(['admin', 'facility-bookings', 'weekly-heatmap', '2026-11-02']);
    expect(adminQueryKeys.closingRecruitments()).toEqual(['admin', 'recruitments', 'closing-this-week']);
    await queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilityBookingsAll });
    await queryClient.invalidateQueries({ queryKey: adminQueryKeys.recruitmentsAll });
    await waitFor(() => {
      expect(heatmapRequests).toBe(2);
      expect(closingRequests).toBe(2);
    });
  });

  // 테스트 기본 retry 를 3 으로 둔다 — 훅의 retry 줄이 빠지면 1초 뒤 다시 받아 waitFor(1초) 안에 실패가 되지 않고 요청 수도 늘어난다.
  it('히트맵은 옛 백엔드 404 를 다시 받지 않는다 — 그 자리 실패로 바로 그린다', async () => {
    heatmapRequests = 0;
    server.use(
      http.get('*/admin/weekly-briefing/facility-heatmap', () => {
        heatmapRequests += 1;
        return HttpResponse.json({ ok: false, message: 'Not Found', data: null }, { status: 404 });
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
    const { result } = renderHook(() => useAdminWeeklyFacilityHeatmapQuery('2026-10-26'), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(heatmapRequests).toBe(1);
    expect(result.current.error).toMatchObject({ status: 404 });
  });

  it('이번 주 모집은 옛 백엔드 404 를 다시 받지 않는다 — 구역 실패로 바로 그린다', async () => {
    closingRequests = 0;
    server.use(
      http.get('*/admin/weekly-briefing/closing-recruitments', () => {
        closingRequests += 1;
        return HttpResponse.json({ ok: false, message: 'Not Found', data: null }, { status: 404 });
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
    const { result } = renderHook(() => useAdminClosingRecruitmentsQuery(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(closingRequests).toBe(1);
    expect(result.current.error).toMatchObject({ status: 404 });
  });

  it('enabled 가 false 면 히트맵·이번 주 모집을 부르지 않는다', async () => {
    heatmapRequests = 0;
    closingRequests = 0;
    useBriefingSideHandlers();
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);
    renderHook(() => useAdminWeeklyFacilityHeatmapQuery('2026-11-02', { enabled: false }), { wrapper });
    renderHook(() => useAdminClosingRecruitmentsQuery({ enabled: false }), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(heatmapRequests).toBe(0);
    expect(closingRequests).toBe(0);
  });
});
