import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { useLoginMutation, useMeQuery } from '../src/auth';
import { userQueryKeys } from '../src/userQueryKeys';

// 로그인 응답의 user 는 /users/me 와 같은 서버 표현(UserResponse)이다 — 로그인 직후 화면이
// 같은 정보를 다시 받아오지 않도록 캐시에 심는다. 계정 전환(캐시 비우기)은 그대로다.

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });
setStorage({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
});

const USER_A: User = {
  id: 1,
  studentId: '20240001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'FRESHMAN',
  role: 'STUDENT',
};
const USER_B: User = {
  id: 2,
  studentId: '20240002',
  name: '김두잉',
  phone: '010-9876-5432',
  grade: 'SENIOR',
  role: 'STUDENT',
};

let meRequestCount = 0;

function givenLoginReturns(user: User) {
  server.use(
    http.post(`${BASE}/auth/web/login`, () =>
      HttpResponse.json({ ok: true, data: { user }, message: null }),
    ),
    http.get(`${BASE}/users/me`, () => {
      meRequestCount += 1;
      return HttpResponse.json({ ok: true, data: user, message: null });
    }),
  );
}

// 앱과 같은 기본값(staleTime 30초) — 방금 심은 데이터가 곧바로 stale 이면 소비자가 다시 요청한다.
function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: false },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  meRequestCount = 0;
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('로그인 직후 me 캐시', () => {
  it('로그인 응답으로 캐시가 서 있어 /users/me 를 다시 부르지 않는다', async () => {
    givenLoginReturns(USER_A);
    const queryClient = newQueryClient();

    const { result } = renderHook(
      () => ({ login: useLoginMutation(), me: useMeQuery() }),
      { wrapper: makeWrapper(queryClient) },
    );

    await act(async () => {
      await result.current.login.mutateAsync({ studentId: '20240001', password: 'pw' });
    });

    await waitFor(() => expect(result.current.me.data).toEqual(USER_A));
    expect(meRequestCount).toBe(0);
  });

  it('다른 계정으로 로그인하면 이전 사용자 정보가 남지 않는다', async () => {
    givenLoginReturns(USER_B);
    const queryClient = newQueryClient();
    queryClient.setQueryData(userQueryKeys.me(), USER_A);
    queryClient.setQueryData(userQueryKeys.myClubs(), [{ clubId: 9 }]);

    const { result } = renderHook(() => useLoginMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ studentId: '20240002', password: 'pw' });
    });

    expect(queryClient.getQueryData(userQueryKeys.me())).toEqual(USER_B);
    // 나머지 이전 계정 캐시는 그대로 비워진다 — 심는 건 로그인 응답이 있는 me 뿐이다.
    expect(queryClient.getQueryData(userQueryKeys.myClubs())).toBeUndefined();
    expect(useAuthStore.getState().user).toEqual(USER_B);
  });
});
