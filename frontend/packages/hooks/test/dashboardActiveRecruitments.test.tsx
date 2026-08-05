import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useActiveRecruitments } from '../src/dashboard';

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

const server = setupServer(
  http.get('*/clubs/10/recruitments', () =>
    HttpResponse.json({
      ok: true, message: null,
      data: [
        { id: 1, clubId: 10, clubName: '두잉', title: '봄 모집', startDate: '2026-06-01', endDate: '2026-06-30',
          capacity: 20, status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
          applicationMode: 'SELF', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' },
        { id: 2, clubId: 10, clubName: '두잉', title: '겨울 모집', startDate: '2025-12-01', endDate: '2025-12-31',
          capacity: 20, status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false,
          applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER' },
        // 만료-OPEN: 마감일은 지났지만 수동 마감 전이라 백엔드는 여전히 OPEN(심사 진행 중)으로 다룬다.
        { id: 3, clubId: 10, clubName: '두잉', title: '가을 모집', startDate: '2025-09-01', endDate: '2025-09-30',
          capacity: 20, status: 'OPEN', displayStatus: 'CLOSED', effectivelyOpen: false,
          applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER' },
      ],
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useActiveRecruitments', () => {
  // 판정 기준은 raw status 다 — displayStatus 로 걸러내면 마감일이 지난 채 심사 중인 모집(id 3)이
  // 진행 중 모집 카드·지원자 요약·처리 필요 업무에서 통째로 사라져 "처리 필요 0건"이 된다.
  it('raw CLOSED만 제외한다 — 마감일이 지난 OPEN(심사 중) 모집은 진행 중으로 센다', async () => {
    const { result } = renderHook(() => useActiveRecruitments(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((r) => r.id)).toEqual([1, 3]);
  });

  it('clubId undefined면 비활성', () => {
    const { result } = renderHook(() => useActiveRecruitments(undefined), { wrapper: makeWrapper(newQueryClient()) });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
