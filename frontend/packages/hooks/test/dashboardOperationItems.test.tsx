import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { bankQueryKeys } from '../src/bankQueryKeys';
import { clubQueryKeys } from '../src/clubQueryKeys';
import { useClubOperationItems, useDashboardTaskQueue } from '../src/dashboard';
import { facilityQueryKeys } from '../src/facilityQueryKeys';
import { feeQueryKeys } from '../src/feeQueryKeys';

const CLUB_ID = 10;
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
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}
const ok = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });
// 미래 날짜(실행일과 무관하게 "오늘 이후")
const FUTURE_DATE = '2099-01-01';

let bankListRequestCount = 0;
const server = setupServer(
  http.get(`*/clubs/${CLUB_ID}/join-requests`, () =>
    ok([
      { joinRequestId: 1, userName: '한지민', studentId: '20261234', major: '경영학과', code: 'A', generation: null,
        status: 'PENDING', requestedAt: '2026-10-26T01:00:00Z', autoApproved: false },
    ]),
  ),
  http.get(`*/leader/clubs/${CLUB_ID}/fee-bills/summary`, () =>
    ok({ totalBilled: 1380000, totalPaid: 1080000, outstanding: 300000, collectionRate: 78.3, billCount: 46,
      pendingCount: 6, partialPaidCount: 0, overdueCount: 4, paidCount: 36 }),
  ),
  http.get(`*/leader/clubs/${CLUB_ID}/bank-matching`, () => ok({ enabled: true })),
  http.get(`*/leader/clubs/${CLUB_ID}/bank-transactions`, () => {
    bankListRequestCount += 1;
    return ok({ content: [], page: 0, size: 20, totalElements: 2, totalPages: 1, hasNext: false });
  }),
  http.get(`*/clubs/${CLUB_ID}/facility-bookings`, () =>
    ok([
      { bookingId: 5, facilityId: 1, roomName: '학생회관 B103', date: FUTURE_DATE, startTime: '18:00:00',
        endTime: '20:00:00', status: 'REJECTED', purpose: '합주', createdAt: '2026-10-20T10:00:00' },
      { bookingId: 6, facilityId: 1, roomName: '학생회관 B103', date: FUTURE_DATE, startTime: '18:00:00',
        endTime: '20:00:00', status: 'APPROVED', purpose: '합주', createdAt: '2026-10-20T10:00:00' },
    ]),
  ),
  // useDashboardTaskQueue 가 함께 부르는 모집 업무 — 진행 중 모집 없음
  http.get(`*/clubs/${CLUB_ID}/recruitments`, () => ok([])),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  bankListRequestCount = 0;
});
afterAll(() => server.close());

describe('useClubOperationItems', () => {
  it('네 출처에서 운영 업무를 만든다', async () => {
    const { result } = renderHook(() => useClubOperationItems(CLUB_ID), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.items.map((item) => item.type)).toEqual([
      'JOIN_REQUESTS_PENDING',
      'FEE_OVERDUE',
      'BANK_REVIEW_PENDING',
      'FACILITY_BOOKING_ATTENTION',
    ]);
  });

  it('기존 화면과 같은 쿼리 키에 캐시를 채운다(회비·은행·가입 요청·시설 화면과 공유)', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useClubOperationItems(CLUB_ID), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(queryClient.getQueryData(clubQueryKeys.joinRequests(CLUB_ID, 'PENDING'))).toBeDefined();
    expect(queryClient.getQueryData(feeQueryKeys.summary(CLUB_ID, {}))).toBeDefined();
    expect(queryClient.getQueryData(bankQueryKeys.matchingStatus(CLUB_ID))).toBeDefined();
    expect(queryClient.getQueryData(bankQueryKeys.transactions(CLUB_ID, { status: 'PENDING' }))).toBeDefined();
    expect(queryClient.getQueryData(facilityQueryKeys.clubBookings(CLUB_ID))).toBeDefined();
  });

  it('자동매칭 미사용이면 거래 목록을 요청하지 않고, 로딩이 끝나며 은행 항목이 없다', async () => {
    server.use(http.get(`*/leader/clubs/${CLUB_ID}/bank-matching`, () => ok({ enabled: false })));
    const { result } = renderHook(() => useClubOperationItems(CLUB_ID), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(bankListRequestCount).toBe(0);
    expect(result.current.items.some((item) => item.type === 'BANK_REVIEW_PENDING')).toBe(false);
  });

  it('자동매칭을 쓰지만 검토 대기 입금이 0건이면 은행 항목이 없다', async () => {
    server.use(
      http.get(`*/leader/clubs/${CLUB_ID}/bank-transactions`, () =>
        ok({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false }),
      ),
    );
    const { result } = renderHook(() => useClubOperationItems(CLUB_ID), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.some((item) => item.type === 'BANK_REVIEW_PENDING')).toBe(false);
  });

  it('출처 하나가 실패하면 isError 이고 나머지 항목은 남는다', async () => {
    server.use(http.get(`*/clubs/${CLUB_ID}/facility-bookings`, () => HttpResponse.json({ ok: false, message: 'boom', data: null }, { status: 500 })));
    const { result } = renderHook(() => useClubOperationItems(CLUB_ID), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.items.map((item) => item.type)).toEqual(['JOIN_REQUESTS_PENDING', 'FEE_OVERDUE', 'BANK_REVIEW_PENDING']);
  });
});

describe('useDashboardTaskQueue', () => {
  it('모집 업무와 운영 업무를 묶음으로 합치고 전체 건수를 센다', async () => {
    const { result } = renderHook(() => useDashboardTaskQueue(CLUB_ID), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalCount).toBe(4);
    expect(result.current.groups.map((group) => group.key)).toEqual(['NOW', 'WAITING', 'INFO']);
  });

  it('진행 중 모집의 검토 대기도 운영 업무와 함께 센다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/recruitments`, () =>
        ok([
          { id: 1, clubId: CLUB_ID, clubName: '두잉', title: '봄 모집', startDate: '2026-06-01', endDate: '2026-06-30',
            capacity: 20, status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
            applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER' },
        ]),
      ),
      http.get('*/leader/recruitments/1/stats/summary', () =>
        ok({ total: 3, submitted: 2, onHold: 1, interviewPending: 0, accepted: 0, rejected: 0, capacity: 20, ratio: 0 }),
      ),
    );
    const { result } = renderHook(() => useDashboardTaskQueue(CLUB_ID), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.totalCount).toBe(5);
    const waiting = result.current.groups.find((group) => group.key === 'WAITING');
    expect(
      waiting?.tasks.some((task) => task.source === 'RECRUITMENT' && task.item.type === 'APPLICANTS_AWAITING_REVIEW'),
    ).toBe(true);
  });
});
