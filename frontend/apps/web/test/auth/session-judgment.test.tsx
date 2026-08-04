import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import posthog from 'posthog-js';

import { createApiClient, registerUnauthorizedHandler } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

import { AuthSessionBootstrap } from '@/app/_components/AuthSessionBootstrap';
import { SessionExpiryHandler } from '@/app/_components/SessionExpiryHandler';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

// 세션 종료 판정이 두 단위에 걸쳐 있다 — 확정은 SessionExpiryHandler(사이드 채널)가 하고,
// AuthSessionBootstrap 은 그 결과를 읽기만 한다. 단독 렌더로는 어느 쪽도 이 계약을 증명하지
// 못하므로, providers 와 같은 구성(부트스트랩 → 만료 핸들러 순)으로 함께 렌더해 검증한다.

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, back: vi.fn(), replace: vi.fn() }),
}));

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });
// refresh 조율기의 "10초 내 갱신됨" 생략 창이 테스트 간 새지 않도록 빈 저장소를 준다.
setStorage({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
});

const TEST_USER: User = {
  id: 1,
  studentId: '20240001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'FRESHMAN',
  role: 'STUDENT',
};

const EXPIRY_TOAST = /세션이 만료/;
const UNAVAILABLE_TOAST = /세션을 확인하지 못했습니다/;

let queryClient: QueryClient;
let logoutCallCount = 0;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  logoutCallCount = 0;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post(`${BASE}/auth/web/logout`, () => {
      logoutCallCount += 1;
      return new HttpResponse(null, { status: 204 });
    }),
  );
});
afterEach(() => {
  server.resetHandlers();
  // 소비되지 않은 보류 통지가 다음 테스트의 마운트 시점에 흘러들지 않게 비운다.
  registerUnauthorizedHandler(() => {});
  registerUnauthorizedHandler(null);
  pushSpy.mockReset();
  useAuthStore.setState({ status: 'idle', user: null });
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});
afterAll(() => server.close());

// 갱신까지 401 — 세션이 서버에서 실제로 끝난 상태.
function givenExpiredSession() {
  server.use(
    http.get(`${BASE}/users/me`, () =>
      HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
    ),
    http.post(`${BASE}/auth/web/refresh`, () =>
      HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 }),
    ),
  );
}

// access 는 만료됐는데 갱신이 만료 외의 사유로 실패한 상태 — 세션은 서버에 살아 있다.
function givenRefreshUnavailable(failure: number | 'network') {
  server.use(
    http.get(`${BASE}/users/me`, () =>
      HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
    ),
    http.post(`${BASE}/auth/web/refresh`, () =>
      failure === 'network'
        ? HttpResponse.error()
        : HttpResponse.json({ ok: false, data: null, message: '일시 오류' }, { status: failure }),
    ),
  );
}

function givenPreviousSession() {
  window.localStorage.setItem('duing:had-session', '1');
}

function renderAuthRuntime() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>
          <AuthSessionBootstrap />
          <SessionExpiryHandler />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

describe('세션 종료 판정 (부트스트랩 + 만료 핸들러)', () => {
  it('쓰던 중 세션이 끊기면 미인증 확정·만료 안내·로그인 이동·캐시 비움·서버 로그아웃까지 수행한다', async () => {
    window.history.replaceState({}, '', '/clubs?tab=mine');
    givenPreviousSession();
    useAuthStore.setState({ status: 'authenticated', user: TEST_USER });
    givenExpiredSession();
    queryClient.setQueryData(['clubs', 'list'], [{ id: 1 }]);

    renderAuthRuntime();

    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(await screen.findByText(EXPIRY_TOAST)).toBeInTheDocument();
    expect(pushSpy).toHaveBeenCalledWith('/login?next=%2Fclubs%3Ftab%3Dmine');
    expect(queryClient.getQueryData(['clubs', 'list'])).toBeUndefined();
    await waitFor(() => expect(logoutCallCount).toBe(1));
    // 종료 전이는 이 브라우저의 세션 이력도 지운다 — 다음 방문의 "확인 실패" 안내가 뜨지 않는다.
    await waitFor(() => expect(window.localStorage.getItem('duing:had-session')).toBeNull());
  });

  it('부팅 중(idle) 도착한 종료는 상태만 확정하고 안내·이동·로그아웃·캐시 비움을 하지 않는다', async () => {
    const clearSpy = vi.spyOn(queryClient, 'clear');
    givenExpiredSession();
    queryClient.setQueryData(['clubs', 'list'], [{ id: 1 }]);

    renderAuthRuntime();

    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(screen.queryByText(EXPIRY_TOAST)).not.toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE_TOAST)).not.toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['clubs', 'list'])).toEqual([{ id: 1 }]);
    // 익명 방문자는 페이지 로드마다 이 경로를 지난다 — 공개 트래픽에 요청이 새면 안 된다.
    expect(logoutCallCount).toBe(0);
    clearSpy.mockRestore();
  });

  it('익명 방문자의 종료에서는 익명 distinct_id 를 갈아치우지 않는다', async () => {
    const resetSpy = vi.spyOn(posthog, 'reset').mockImplementation(() => {});
    givenExpiredSession();

    renderAuthRuntime();

    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(resetSpy).not.toHaveBeenCalled();
    resetSpy.mockRestore();
  });

  // 이 PR 이 닫는 결함 — 갱신이 만료 외의 사유로 실패하면 세션은 서버에 살아 있다.
  // 이전에는 네 경우가 모두 로그아웃으로 처리됐다.
  it.each([403, 500, 503, 'network' as const])(
    '갱신이 %s 로 실패하면 세션을 끝내지 않고 확인 실패 안내와 다시 시도를 준다',
    async (failure) => {
      givenPreviousSession();
      givenRefreshUnavailable(failure);

      renderAuthRuntime();

      expect(await screen.findByText(UNAVAILABLE_TOAST)).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible();
      expect(useAuthStore.getState()).toMatchObject({ status: 'idle', user: null });
      expect(screen.queryByText(EXPIRY_TOAST)).not.toBeInTheDocument();
      expect(pushSpy).not.toHaveBeenCalled();
      expect(logoutCallCount).toBe(0);
    },
  );

  it('동시 401 여러 건에도 만료 안내와 로그인 이동은 각 1회다', async () => {
    // 토스트 개수만으로는 부족하다 — ToastProvider 가 같은 문구+variant 를 이미 걸러서
    // 핸들러의 중복 가드를 지워도 토스트는 1개로 보인다. 가드가 실제로 받는 부수효과
    // (이동·서버 로그아웃·캐시 비움)의 횟수를 함께 단언한다.
    const clearSpy = vi.spyOn(queryClient, 'clear');
    useAuthStore.setState({ status: 'authenticated', user: TEST_USER });
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
      http.post(`${BASE}/auth/web/refresh`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
      }),
    );

    renderAuthRuntime();
    await act(async () => {
      await Promise.allSettled([
        apiClient.favorites.ids(),
        apiClient.favorites.ids(),
        apiClient.favorites.ids(),
      ]);
    });

    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(screen.getAllByText(EXPIRY_TOAST)).toHaveLength(1);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(logoutCallCount).toBe(1));
    clearSpy.mockRestore();
  });

  // §6.2 불변식: 종료 확정은 동기 setState 로 먼저 기록된다. 이걸 async clearSession() 하나로
  // 합치면 부트스트랩의 catch 가 아직 idle 을 읽어, 확정된 만료에 "로그인 상태는 유지됩니다"
  // 안내가 뜬다. 아래 구성(세션 이력 있음 + 진짜 만료)이 정확히 그 차이를 드러낸다.
  it('종료가 확정되면 부트스트랩은 catch 시점에 이미 미인증을 읽는다', async () => {
    givenPreviousSession();
    givenExpiredSession();

    renderAuthRuntime();

    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    // catch 가 확실히 지나가도록 마이크로태스크를 한 번 더 흘린다.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(UNAVAILABLE_TOAST)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });
});
