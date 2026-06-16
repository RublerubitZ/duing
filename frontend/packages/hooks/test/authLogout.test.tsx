import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient, TOKEN_STORAGE_KEY } from '@duing/api';
import { setStorage, type Storage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';
import { ApiClientProvider } from '../src/api-context';
import { useLogout } from '../src/auth';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const store = new Map<string, string>();
const memoryStorage: Storage = {
  getItem: async (key) => store.get(key) ?? null,
  setItem: async (key, value) => {
    store.set(key, value);
  },
  removeItem: async (key) => {
    store.delete(key);
  },
};

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

beforeEach(() => {
  setStorage(memoryStorage);
  store.clear();
  store.set(TOKEN_STORAGE_KEY, 'tok-123');
  useAuthStore.setState({ status: 'authenticated', accessToken: 'tok-123', user: null });
});

describe('useLogout', () => {
  it('토큰을 지우기 전에 Bearer 를 실어 POST /auth/logout 으로 서버 세션을 폐기하고 로컬 세션을 정리한다', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.post('*/auth/logout', ({ request }) => {
        capturedAuth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    const queryClient = newQueryClient();
    const { result } = renderHook(() => useLogout(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      await result.current();
    });

    // 토큰이 아직 storage 에 있을 때 호출돼야 Bearer 가 실린다 (clearSession 이전 호출 보장)
    expect(capturedAuth).toBe('Bearer tok-123');
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(await memoryStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('서버 폐기가 실패(500)해도 로컬 세션 정리는 계속 진행한다 (best-effort)', async () => {
    server.use(
      http.post('*/auth/logout', () =>
        HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 }),
      ),
    );

    const queryClient = newQueryClient();
    const { result } = renderHook(() => useLogout(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      await result.current();
    });

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(await memoryStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});
