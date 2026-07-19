import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { useAuthStore } from '@duing/stores';
import { ApiClientProvider } from '../src/api-context';
import { useFavoriteIdsQuery, useFavoriteListQuery } from '../src/favorites';

const server = setupServer();

// onUnhandledRequest는 'error'로 두어, 비로그인인데도 요청이 새어 나가면 자연히 실패한다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const apiClient = createApiClient({
  baseUrl: 'http://localhost:8080/api/v1',
  authTransport: 'cookie',
});

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
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// 두 favorites 엔드포인트에 핸들러를 걸고, 실제로 호출됐는지 플래그로 관측한다.
function trackFavoritesRequests() {
  const calls = { ids: false, list: false };
  server.use(
    http.get('*/me/favorites/ids', () => {
      calls.ids = true;
      return HttpResponse.json({ ok: true, data: { clubIds: [1, 2] }, message: null });
    }),
    http.get('*/me/favorites', () => {
      calls.list = true;
      return HttpResponse.json({
        ok: true,
        data: { content: [], totalElements: 0, totalPages: 0 },
        message: null,
      });
    }),
  );
  return calls;
}

describe('favorites 쿼리 인증 가드', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'idle', user: null });
  });

  it.each(['unauthenticated', 'idle'] as const)(
    '비로그인(%s)이면 favorites API를 호출하지 않는다',
    async (status) => {
      const calls = trackFavoritesRequests();
      useAuthStore.setState({ status, user: null });

      const queryClient = newQueryClient();
      const { result } = renderHook(
        () => ({ ids: useFavoriteIdsQuery(), list: useFavoriteListQuery() }),
        { wrapper: makeWrapper(queryClient) },
      );

      // 쿼리가 disabled면 fetchStatus는 계속 'idle'이라 요청이 나가지 않는다.
      await waitFor(() => {
        expect(result.current.ids.fetchStatus).toBe('idle');
        expect(result.current.list.fetchStatus).toBe('idle');
      });

      expect(calls.ids).toBe(false);
      expect(calls.list).toBe(false);
    },
  );

  it('로그인(authenticated)이면 favorites API를 호출한다', async () => {
    const calls = trackFavoritesRequests();
    useAuthStore.setState({ status: 'authenticated', user: null });

    const queryClient = newQueryClient();
    const { result } = renderHook(
      () => ({ ids: useFavoriteIdsQuery(), list: useFavoriteListQuery() }),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.ids.isSuccess).toBe(true);
      expect(result.current.list.isSuccess).toBe(true);
    });

    expect(calls.ids).toBe(true);
    expect(calls.list).toBe(true);
    expect(result.current.ids.data).toEqual([1, 2]);
  });
});
