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

const apiClient = createApiClient({
  baseUrl: 'http://localhost:8080/api/v1',
  authTransport: 'cookie',
});

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
  useAuthStore.setState({ status: 'authenticated', user: null });
});

describe('useLogout', () => {
  it('POST /auth/web/logout 성공 후에만 로컬 세션과 캐시를 정리한다', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.post('*/auth/web/logout', ({ request }) => {
        capturedAuth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    const queryClient = newQueryClient();
    const { result } = renderHook(() => useLogout(), { wrapper: makeWrapper(queryClient) });

    queryClient.setQueryData(['users', 'me'], { id: 1 });

    await act(async () => {
      await result.current();
    });

    expect(capturedAuth).toBeNull();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(await memoryStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    // 로그인·부팅 복원이 심어 둔 사용자 정보도 함께 사라진다(공용 단말 노출 방지).
    expect(queryClient.getQueryData(['users', 'me'])).toBeUndefined();
  });

  it('서버 로그아웃이 실패하면 오류를 전파하고 로컬 세션과 캐시를 유지한다', async () => {
    server.use(
      http.post('*/auth/web/logout', () =>
        HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 }),
      ),
    );

    const queryClient = newQueryClient();
    const { result } = renderHook(() => useLogout(), { wrapper: makeWrapper(queryClient) });

    queryClient.setQueryData(['users', 'me'], { id: 1 });

    await act(async () => {
      await expect(result.current()).rejects.toMatchObject({ status: 500 });
    });

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(await memoryStorage.getItem(TOKEN_STORAGE_KEY)).toBe('tok-123');
    expect(queryClient.getQueryData(['users', 'me'])).toEqual({ id: 1 });
  });
});
