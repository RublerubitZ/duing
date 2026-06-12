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
        applicationMode: 'SELF', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' },
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

  it('useInterview=false 모집은 interview-rounds를 호출하지 않고 통계 기반 액션만 반환', async () => {
    // recruitment 1을 비면접 모집으로 덮어쓴다.
    // 게이팅 검증 방식: afterEach(resetHandlers)로 복원된 기본 interview-rounds 핸들러가 여전히
    // 응답 가능하므로, 훅이 잘못 호출해도 서버 에러로는 잡히지 않는다. 대신 출력값으로 검증한다.
    // 비면접 모집은 통계 기반 APPLICANTS_AWAITING_REVIEW 1건만 생성해야 하므로 totalCount === 1.
    // 훅이 interview-rounds를 잘못 호출하면 INTERVIEW_ROUND_UNCONFIRMED 항목이 추가되어
    // totalCount === 2가 되고 아래 waitFor 단언이 실패한다.
    server.use(
      http.get('*/clubs/10/recruitments', () =>
        HttpResponse.json({ ok: true, message: null, data: [
          { id: 1, clubId: 10, clubName: '두잉', title: '일반 모집', startDate: '2026-06-01', endDate: '2026-12-30',
            capacity: 20, status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
            applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER' },
        ] }),
      ),
    );
    const { result } = renderHook(() => useClubActionItems(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      // 통계 기반 검토 대기(submitted 2 + underReview 3 = 5)만 1건
      expect(result.current.totalCount).toBe(1);
    });
    expect(result.current.preview[0]?.type).toBe('APPLICANTS_AWAITING_REVIEW');
    expect(result.current.isError).toBe(false);
  });

  it('모집이 모두 CLOSED이면 액션 아이템 없음', async () => {
    server.use(
      http.get('*/clubs/10/recruitments', () =>
        HttpResponse.json({ ok: true, message: null, data: [
          { id: 1, clubId: 10, clubName: '두잉', title: '봄 모집', startDate: '2026-06-01', endDate: '2026-06-30',
            capacity: 20, status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false,
            applicationMode: 'SELF', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' },
        ] }),
      ),
    );
    const { result } = renderHook(() => useClubActionItems(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalCount).toBe(0);
    expect(result.current.preview.length).toBe(0);
  });
});
