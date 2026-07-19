import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { MySession } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { SessionListCard } from '@/app/me/settings/_components/SessionListCard';

// login-remember-me.test.tsx 관례: 실제 ApiClient(cookie transport) 주입 + MSW 스텁,
// TanStack Query 자체는 모킹하지 않는다. next/navigation 만 mock 해 라우팅을 관찰한다.
const replaceSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

// clearSession(전체 로그아웃) 이 토큰을 정리할 수 있도록 인메모리 storage 주입.
const memoryStore = new Map<string, string>();
setStorage({
  getItem: (key) => Promise.resolve(memoryStore.get(key) ?? null),
  setItem: (key, value) => {
    memoryStore.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key) => {
    memoryStore.delete(key);
    return Promise.resolve();
  },
});

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

const SESSIONS: MySession[] = [
  {
    sessionId: 1,
    platform: 'WEB',
    deviceLabel: 'Chrome · macOS',
    lastUsedAt: '2026-07-18T14:30:00',
    current: true,
  },
  {
    sessionId: 2,
    platform: 'IOS',
    deviceLabel: 'iPhone 15',
    lastUsedAt: '2026-07-17T20:00:00',
    current: false,
  },
];

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  useAuthStore.setState({ status: 'authenticated', user: null });
});
afterEach(() => {
  server.resetHandlers();
  replaceSpy.mockReset();
  useAuthStore.setState({ status: 'idle', user: null });
});
afterAll(() => server.close());

function stubSessions(sessions: MySession[]) {
  server.use(
    http.get(`${BASE}/users/me/sessions`, () =>
      HttpResponse.json({ ok: true, data: sessions, message: null }),
    ),
  );
}

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>
          <SessionListCard />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

describe('SessionListCard', () => {
  it('현재 기기엔 배지만, 다른 기기엔 로그아웃 버튼을 보여준다', async () => {
    stubSessions(SESSIONS);
    renderCard();

    expect(await screen.findByText('iPhone 15')).toBeInTheDocument();
    expect(screen.getByText('Chrome · macOS')).toBeInTheDocument();
    expect(screen.getByText('현재 기기')).toBeInTheDocument();
    // 다른 기기(1개)만 개별 로그아웃 버튼을 가진다 — 현재 기기 행에는 없다.
    expect(screen.getAllByRole('button', { name: '로그아웃' })).toHaveLength(1);
  });

  it('다른 기기 로그아웃 시 DELETE 를 호출하고 목록에서 사라진다', async () => {
    let currentSessions = [...SESSIONS];
    let deletedId: string | null = null;
    server.use(
      http.get(`${BASE}/users/me/sessions`, () =>
        HttpResponse.json({ ok: true, data: currentSessions, message: null }),
      ),
      http.delete(`${BASE}/users/me/sessions/:id`, ({ params }) => {
        deletedId = String(params.id);
        currentSessions = currentSessions.filter((s) => String(s.sessionId) !== params.id);
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await screen.findByText('iPhone 15');
    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(deletedId).toBe('2'));
    await waitFor(() => expect(screen.queryByText('iPhone 15')).not.toBeInTheDocument());
    expect(await screen.findByText('해당 기기에서 로그아웃했어요.')).toBeInTheDocument();
  });

  it('전체 로그아웃 시 DELETE 세션 전체 호출 + 세션을 비우고 홈으로 이동한다', async () => {
    let logoutAllCalled = false;
    stubSessions(SESSIONS);
    server.use(
      http.delete(`${BASE}/users/me/sessions`, () => {
        logoutAllCalled = true;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await screen.findByText('iPhone 15');
    await user.click(screen.getByRole('button', { name: '다른 모든 기기에서 로그아웃' }));

    await waitFor(() => expect(logoutAllCalled).toBe(true));
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(replaceSpy).toHaveBeenCalledWith('/');
  });

  it('deviceLabel 이 없으면 플랫폼 한글 라벨로 표시한다', async () => {
    stubSessions([
      {
        sessionId: 9,
        platform: 'UNKNOWN',
        deviceLabel: null,
        lastUsedAt: '2026-07-18T14:30:00',
        current: true,
      },
    ]);
    renderCard();

    expect(await screen.findByText('기타')).toBeInTheDocument();
  });
});
