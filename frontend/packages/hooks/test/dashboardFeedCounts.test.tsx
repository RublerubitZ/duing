import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useClubFeedCounts } from '../src/dashboard';

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
  http.get('*/clubs/10/notices', () =>
    HttpResponse.json({ ok: true, message: null, data: { content: [], page: 0, size: 1, totalElements: 7, totalPages: 7, hasNext: true } }),
  ),
  http.get('*/clubs/10/events', () =>
    HttpResponse.json({ ok: true, message: null, data: [{ id: 1, title: 'a', startAt: '2026-06-12T05:00:00Z', endAt: '2026-06-12T06:00:00Z', location: null }, { id: 2, title: 'b', startAt: '2026-06-13T05:00:00Z', endAt: '2026-06-13T06:00:00Z', location: null }] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useClubFeedCounts', () => {
  it('공지 총건수와 이벤트 건수를 반환', async () => {
    const { result } = renderHook(() => useClubFeedCounts(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.noticeCount).toBe(7);
    expect(result.current.eventCount).toBe(2);
  });

  it('clubId가 undefined이면 카운트 0이고 로딩 false', () => {
    const { result } = renderHook(() => useClubFeedCounts(undefined), { wrapper: makeWrapper(newQueryClient()) });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.noticeCount).toBe(0);
    expect(result.current.eventCount).toBe(0);
  });
});
