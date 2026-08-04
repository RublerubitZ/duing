import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '@duing/api';
import {
  ApiClientProvider,
  useFavoriteIdsQuery,
  useMeQuery,
  useMyApplicationsQuery,
} from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

// 비로그인 부팅(시드 = 초기값 unauthenticated)에서 인증 종속 쿼리가 한 건도 나가지 않는다(metric 8).
// 부트스트랩이 따로 쏘는 /users/me 1건은 이 훅 레벨 관측 밖이라 여기서는 잡히지 않는다.

const BASE = 'http://localhost:8080/api/v1';
const requestedPaths: string[] = [];
const server = setupServer(
  http.all(`${BASE}/*`, ({ request }) => {
    requestedPaths.push(new URL(request.url).pathname);
    return HttpResponse.json(
      { ok: false, data: null, message: '인증이 필요합니다.' },
      { status: 401 },
    );
  }),
);

const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  requestedPaths.length = 0;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('익명 부팅 트래픽 (metric 8)', () => {
  it('시드된 unauthenticated(익명 부팅)에서는 인증 종속 쿼리가 비활성이다', async () => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);

    const { result } = renderHook(
      () => ({
        me: useMeQuery(),
        favorites: useFavoriteIdsQuery(),
        applications: useMyApplicationsQuery(),
      }),
      { wrapper: makeWrapper(newQueryClient()) },
    );

    // 쿼리가 disabled 면 fetchStatus 는 계속 'idle' 이라 요청이 나가지 않는다.
    await waitFor(() => {
      expect(result.current.me.fetchStatus).toBe('idle');
      expect(result.current.favorites.fetchStatus).toBe('idle');
      expect(result.current.applications.fetchStatus).toBe('idle');
    });

    expect(requestedPaths).toEqual([]);
  });

  it('시드된 authenticated(미검증)에서는 확인을 기다리지 않고 요청한다', async () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: false, user: null });

    renderHook(() => useFavoriteIdsQuery(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() =>
      expect(requestedPaths.some((path) => path.endsWith('/me/favorites/ids'))).toBe(true),
    );
  });
});
