import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useClubActionItems } from '../src/dashboard';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={qc}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const server = setupServer(
  http.get('*/clubs/10/recruitments', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { id: 1, clubId: 10, clubName: '두잉', title: '봄 모집', startDate: '2026-06-01', endDate: '2026-06-30',
        capacity: 20, status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
        applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' },
    ] }),
  ),
  http.get('*/leader/recruitments/1/stats/summary', () =>
    HttpResponse.json({ ok: true, message: null, data: { total: 9, submitted: 2, underReview: 3, interviewPending: 0, accepted: 0, rejected: 0, capacity: 20, ratio: 0 } }),
  ),
  http.get('*/leader/recruitments/1/interview-rounds', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { roundId: 7, title: '1차 면접', status: 'ASSIGNING', availabilityDeadline: null, location: null, totalMemberCount: 0, respondedMemberCount: 0 },
    ] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useClubActionItems', () => {
  it('총 건수 + 정렬된 미리보기(최대 3) 반환', async () => {
    const { result } = renderHook(() => useClubActionItems(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // 검토 대기(5) + 미확정 라운드(7) = 2건
    expect(result.current.totalCount).toBe(2);
    expect(result.current.preview.length).toBeLessThanOrEqual(3);
    // 기한 없음 → 타입 우선순위로 미확정 라운드가 먼저
    expect(result.current.preview[0]?.type).toBe('INTERVIEW_ROUND_UNCONFIRMED');
  });
});
