import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  ApiError,
  createApiClient,
  registerUnauthorizedHandler,
  notifyUnauthorized,
} from '@duing/api';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { SessionExpiryHandler } from '@/app/_components/SessionExpiryHandler';

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, back: vi.fn(), replace: vi.fn() }),
}));

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });
setStorage({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  registerUnauthorizedHandler(null);
  pushSpy.mockReset();
  useAuthStore.setState({ status: 'idle', user: null });
  window.history.replaceState({}, '', '/');
});
afterAll(() => server.close());

describe('API 401 감지 (afterResponse)', () => {
  it('Cookie 요청이 401 이면 등록된 핸들러를 호출한다', async () => {
    const handler = vi.fn();
    registerUnauthorizedHandler(handler);

    server.use(
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    );

    await expect(apiClient.favorites.ids()).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Cookie 요청이 403 이면 등록된 핸들러를 호출하지 않는다', async () => {
    const handler = vi.fn();
    registerUnauthorizedHandler(handler);

    server.use(
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ message: '권한이 없습니다.' }, { status: 403 }),
      ),
    );

    await expect(apiClient.favorites.ids()).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('SessionExpiryHandler', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SessionExpiryHandler />
        </ToastProvider>
      </QueryClientProvider>,
    );
  });

  it('인증 상태에서 401 이 발생하면 세션 정리 후 현재 경로를 next로 보존해 로그인으로 이동한다', async () => {
    window.history.replaceState({}, '', '/clubs?tab=mine');
    useAuthStore.setState({ status: 'authenticated' });

    act(() => notifyUnauthorized());

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(pushSpy).toHaveBeenCalledWith('/login?next=%2Fclubs%3Ftab%3Dmine');
    expect(await screen.findByText(/세션이 만료/)).toBeInTheDocument();
  });

  it('동시다발 401 에도 중복 토스트·이동이 발생하지 않는다', () => {
    useAuthStore.setState({ status: 'authenticated' });

    act(() => {
      notifyUnauthorized();
      notifyUnauthorized();
      notifyUnauthorized();
    });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/세션이 만료/)).toHaveLength(1);
  });

  it('이미 미인증 상태면 아무 동작도 하지 않는다', () => {
    useAuthStore.setState({ status: 'unauthenticated' });

    act(() => notifyUnauthorized());

    expect(pushSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/세션이 만료/)).not.toBeInTheDocument();
  });

  it('만료 처리 시 이전 사용자 데이터(React Query 캐시)를 비운다', () => {
    useAuthStore.setState({ status: 'authenticated' });
    queryClient.setQueryData(['users', 'me'], { id: 1, name: '테스트' });

    act(() => notifyUnauthorized());

    expect(queryClient.getQueryData(['users', 'me'])).toBeUndefined();
  });
});
