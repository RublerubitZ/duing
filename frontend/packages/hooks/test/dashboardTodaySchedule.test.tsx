import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useTodaySchedule } from '../src/dashboard';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={qc}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

// 테스트는 '오늘'이 동적이므로, 이벤트/슬롯 시작시각을 KST 오늘로 만들기 위해 today 기준 ISO를 생성한다.
function kstTodayAt(hour: number): string {
  const todayKst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  return `${todayKst}T${String(hour).padStart(2, '0')}:00:00+09:00`;
}

const server = setupServer(
  http.get('*/clubs/10/recruitments', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { id: 1, clubId: 10, clubName: '두잉', title: '봄 모집', startDate: '2026-06-01', endDate: '2026-12-30',
        capacity: 20, status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
        applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' },
    ] }),
  ),
  http.get('*/leader/recruitments/1/interview-rounds', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { roundId: 7, title: '1차 면접', status: 'SCHEDULED', availabilityDeadline: null, location: '301호', totalMemberCount: 5, respondedMemberCount: 5 },
    ] }),
  ),
  http.get('*/leader/interview-rounds/7', () =>
    HttpResponse.json({ ok: true, message: null, data: {
      roundId: 7, title: '1차 면접', status: 'SCHEDULED', availabilityDeadline: null, location: '301호',
      requestSequence: 1, deadlinePassed: false, counts: {}, members: [],
      slots: [{ slotId: 1, startTime: kstTodayAt(14), endTime: kstTodayAt(15), capacity: 3, selectedCount: 3, assignedCount: 3 }],
    } }),
  ),
  http.get('*/clubs/10/events', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { id: 50, title: '정기모임', startAt: kstTodayAt(14), endAt: kstTodayAt(16), location: '동방' },
    ] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useTodaySchedule', () => {
  it('오늘 면접 슬롯 + 이벤트를 병합하고 동일시간 면접 우선 정렬', async () => {
    const { result } = renderHook(() => useTodaySchedule(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toHaveLength(2);
    // 14:00 동일 → 면접이 먼저
    expect(result.current.items[0]?.kind).toBe('INTERVIEW');
    expect(result.current.items[0]?.roundId).toBe(7);
    expect(result.current.items[1]?.kind).toBe('EVENT');
  });

  it('useInterview=false 모집은 interview-rounds를 호출하지 않고 이벤트만 반환', async () => {
    // recruitment 1을 비면접 모집으로 덮어쓴다. interview-rounds 핸들러는 그대로 두지만,
    // 훅이 해당 엔드포인트를 호출하면 onUnhandledRequest:'error'로 실패시키기 위해 라우트를 제거한다.
    server.use(
      http.get('*/clubs/10/recruitments', () =>
        HttpResponse.json({ ok: true, message: null, data: [
          { id: 1, clubId: 10, clubName: '두잉', title: '일반 모집', startDate: '2026-06-01', endDate: '2026-12-30',
            capacity: 20, status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
            applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER' },
        ] }),
      ),
      http.get('*/leader/recruitments/1/interview-rounds', () =>
        HttpResponse.json({ ok: false, message: 'interview-rounds should not be called', data: null }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useTodaySchedule(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.kind).toBe('EVENT');
    expect(result.current.items[0]?.eventId).toBe(50);
  });
});
