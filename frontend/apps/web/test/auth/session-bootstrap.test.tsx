import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import posthog from 'posthog-js';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

import { AuthSessionBootstrap } from '@/app/_components/AuthSessionBootstrap';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });
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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useAuthStore.setState({ status: 'idle', user: null });
  window.localStorage.clear();
});
afterAll(() => server.close());

// 알림은 "이 브라우저에서 세션이 살아 있던 적이 있는" 사용자에게만 뜬다.
function givenPreviousSession() {
  window.localStorage.setItem('duing:had-session', '1');
}

function renderBootstrap() {
  return render(
    <ApiClientProvider client={apiClient}>
      <ToastProvider>
        <AuthSessionBootstrap />
      </ToastProvider>
    </ApiClientProvider>,
  );
}

describe('AuthSessionBootstrap', () => {
  it('/users/me 성공 시 사용자 세션을 복원한다', async () => {
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: true, data: TEST_USER, message: null }),
      ),
    );

    renderBootstrap();

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(useAuthStore.getState().user).toEqual(TEST_USER);
  });

  it('/users/me 401 시 미인증 상태로 전환한다', async () => {
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    );

    renderBootstrap();

    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(useAuthStore.getState().user).toBeNull();
  });

  it.each([500, 503])('/users/me %i 오류를 인증 만료로 오판하지 않는다', async (status) => {
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status }),
      ),
    );

    givenPreviousSession();
    renderBootstrap();

    expect(await screen.findByRole('alert')).toHaveTextContent('세션을 확인하지 못했습니다');
    expect(useAuthStore.getState()).toMatchObject({ status: 'idle', user: null });
  });

  it('/users/me 네트워크 오류를 인증 만료로 오판하지 않는다', async () => {
    server.use(http.get(`${BASE}/users/me`, () => HttpResponse.error()));

    givenPreviousSession();
    renderBootstrap();

    expect(await screen.findByRole('alert')).toHaveTextContent('세션을 확인하지 못했습니다');
    expect(useAuthStore.getState()).toMatchObject({ status: 'idle', user: null });
  });

  it('세션을 가진 적 없는 방문자에게는 확인 실패를 알리지 않는다', async () => {
    server.use(http.get(`${BASE}/users/me`, () => HttpResponse.error()));

    renderBootstrap();

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(useAuthStore.getState()).toMatchObject({ status: 'idle', user: null });
  });

  it('401 이후에는 세션 이력이 지워져 다음 실패를 알리지 않는다', async () => {
    givenPreviousSession();
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    );

    renderBootstrap();

    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(window.localStorage.getItem('duing:had-session')).toBeNull();
  });

  // 로그인 뮤테이션은 이 컴포넌트를 거치지 않고 스토어에 직접 세션을 세운다. 그 경로에서 이력이
  // 남지 않으면, 방금 로그인한 사용자가 새로고침 중 일시 오류를 만났을 때 알림도 재시도 버튼도
  // 받지 못하고 조용히 멈춘다.
  it('부트스트랩 밖에서 세션이 서도 이력을 남긴다', async () => {
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    );

    renderBootstrap();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));

    act(() => useAuthStore.getState().setSession(TEST_USER));

    await waitFor(() =>
      expect(window.localStorage.getItem('duing:had-session')).toBe('1'),
    );
  });

  it('로그아웃으로 세션이 지워지면 이력도 지운다', async () => {
    givenPreviousSession();
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: true, data: TEST_USER, message: null }),
      ),
    );

    renderBootstrap();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));

    await act(async () => {
      await useAuthStore.getState().clearSession();
    });

    await waitFor(() => expect(window.localStorage.getItem('duing:had-session')).toBeNull());
  });

  // 세션 종료는 경로가 여럿(로그아웃·만료·전체 로그아웃·탈퇴)이지만 전부 스토어 status 전이를
  // 지난다 — 공용 단말에서 다음 사용자의 이벤트가 이전 distinct_id 에 붙지 않아야 한다.
  it('세션 종료 전이에서 PostHog identity 를 초기화한다', async () => {
    const resetSpy = vi.spyOn(posthog, 'reset').mockImplementation(() => {});
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: true, data: TEST_USER, message: null }),
      ),
    );

    renderBootstrap();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(resetSpy).not.toHaveBeenCalled();

    await act(async () => {
      await useAuthStore.getState().clearSession();
    });

    await waitFor(() => expect(resetSpy).toHaveBeenCalledTimes(1));
    resetSpy.mockRestore();
  });

  it('익명 방문자의 401 에서는 익명 distinct_id 를 갈아치우지 않는다', async () => {
    const resetSpy = vi.spyOn(posthog, 'reset').mockImplementation(() => {});
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    );

    renderBootstrap();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));

    expect(resetSpy).not.toHaveBeenCalled();
    resetSpy.mockRestore();
  });

  it('/users/me 403을 인증 만료로 오판하지 않고 재시도를 제공한다', async () => {
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    );

    givenPreviousSession();
    renderBootstrap();

    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible();
    expect(useAuthStore.getState()).toMatchObject({ status: 'idle', user: null });
  });

  it('일시 오류 후 사용자가 다시 시도하면 세션을 복원한다', async () => {
    const user = userEvent.setup();
    let requestCount = 0;
    server.use(
      http.get(`${BASE}/users/me`, () => {
        requestCount += 1;
        if (requestCount === 1) {
          return HttpResponse.json(
            { ok: false, data: null, message: '서버 오류' },
            { status: 503 },
          );
        }
        return HttpResponse.json({ ok: true, data: TEST_USER, message: null });
      }),
    );

    givenPreviousSession();
    renderBootstrap();
    await user.click(await screen.findByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(useAuthStore.getState().user).toEqual(TEST_USER);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requestCount).toBe(2);
  });
});
