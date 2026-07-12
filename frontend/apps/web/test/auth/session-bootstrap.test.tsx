import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

import { AuthSessionBootstrap } from '@/app/_components/AuthSessionBootstrap';

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
});
afterAll(() => server.close());

function renderBootstrap() {
  return render(
    <ApiClientProvider client={apiClient}>
      <AuthSessionBootstrap />
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

    renderBootstrap();

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(useAuthStore.getState()).toMatchObject({ status: 'idle', user: null });
  });

  it('/users/me 네트워크 오류를 인증 만료로 오판하지 않는다', async () => {
    server.use(http.get(`${BASE}/users/me`, () => HttpResponse.error()));

    renderBootstrap();

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(useAuthStore.getState()).toMatchObject({ status: 'idle', user: null });
  });
});
