import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient, registerUnauthorizedHandler } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

import { AuthSessionBootstrap } from '@/app/_components/AuthSessionBootstrap';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { SESSION_USER_KEY, consumeBootSessionRestore } from '@/app/_lib/authBoot';

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });
setStorage({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
});
const MEMBER: User = {
  id: 1,
  studentId: '20240001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'FRESHMAN',
  role: 'STUDENT',
};
const OTHER_MEMBER: User = { ...MEMBER, id: 2, studentId: '20240002', name: '김철수' };
// jsdom 은 Location 을 재정의할 수 없어 전역을 스텁한다(기존 하드 이동 테스트와 같은 방식).
const reloadSpy = vi.fn();
let meRequestCount = 0;
let queryClient: QueryClient;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  vi.stubGlobal('location', { ...window.location, reload: reloadSpy });
});
beforeEach(() => {
  // 앱과 같은 기본값 — 부팅 복원이 채운 캐시가 곧바로 stale 이 되지 않게 한다.
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
  meRequestCount = 0;
  server.use(
    http.get(`${BASE}/users/me`, () => {
      meRequestCount += 1;
      return HttpResponse.json({ ok: true, data: MEMBER, message: null });
    }),
  );
});
afterEach(() => {
  server.resetHandlers();
  // Storage 스파이를 먼저 되돌린다 — 그대로면 아래 localStorage.clear() 가 남은 값을 못 지운다.
  vi.restoreAllMocks();
  reloadSpy.mockClear();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  window.localStorage.clear();
  // 선점 프로미스는 모듈 스코프 1회 가드다 — 비우지 않으면 다음 테스트가 남의 요청을 물려받는다.
  consumeBootSessionRestore();
  // 사이드 채널에 쌓인 보류 통지를 비워 다음 테스트가 남의 세션 종료를 물려받지 않게 한다.
  registerUnauthorizedHandler(() => {});
  registerUnauthorizedHandler(null);
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

function renderBootstrap() {
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthSessionBootstrap />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

// 부팅 확인이 끝나 이 탭이 공유 표지에 A(id 1)를 쓴 상태까지 간다.
async function renderVerifiedMember() {
  const rendered = renderBootstrap();
  await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('1'));
  return rendered;
}

function throwBlocked(): never {
  throw new DOMException('blocked', 'SecurityError');
}

describe('공유 사용자 표지 — 쓰기', () => {
  it('부팅 확인이 끝나면 확인된 사용자 id 를 공유 표지에 쓴다', async () => {
    renderBootstrap();

    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('1'));
  });

  it('부팅 확인 전에는 공유 표지를 건드리지 않는다', async () => {
    window.localStorage.setItem(SESSION_USER_KEY, '2');
    let releaseMe = () => {};
    const meHeld = new Promise<void>((resolve) => {
      releaseMe = resolve;
    });
    server.use(
      http.get(`${BASE}/users/me`, async () => {
        await meHeld;
        meRequestCount += 1;
        return HttpResponse.json({ ok: true, data: MEMBER, message: null });
      }),
    );

    renderBootstrap();
    await act(async () => {});

    // 미검증 상태에서 비로그인(null)으로 써 버리면 다른 탭이 남긴 값이 지워진다.
    expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('2');

    releaseMe();

    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('1'));
  });

  it('이 탭에서 다른 계정으로 바뀌면 그 id 를 쓰고, 만료가 확정되면 표지를 지운다', async () => {
    await renderVerifiedMember();

    // 로그인 상태에서 다른 계정으로 로그인 — status·isVerified 는 그대로이고 user 만 바뀐다.
    act(() => useAuthStore.getState().setSession(OTHER_MEMBER));
    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('2'));

    // SessionExpiryHandler 의 확정 순서 그대로 — 동기 setState 로 내린 뒤 clearSession.
    act(() => {
      useAuthStore.setState({ status: 'unauthenticated', isVerified: true });
      void useAuthStore
        .getState()
        .clearSession()
        .catch(() => {});
    });
    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBeNull());
  });

  it('저장소에 접근할 수 없어도 부팅 확인은 그대로 끝난다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwBlocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwBlocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(throwBlocked);

    renderBootstrap();

    await waitFor(() => expect(useAuthStore.getState().isVerified).toBe(true));
  });
});
