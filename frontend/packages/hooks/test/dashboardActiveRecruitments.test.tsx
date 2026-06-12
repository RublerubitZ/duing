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
      ],
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useActiveRecruitments', () => {
  it('CLOSED를 제외한 진행 중 모집만 반환', async () => {
    const { result } = renderHook(() => useActiveRecruitments(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((r) => r.id)).toEqual([1]);
  });

  it('clubId undefined면 비활성', () => {
    const { result } = renderHook(() => useActiveRecruitments(undefined), { wrapper: makeWrapper(newQueryClient()) });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
