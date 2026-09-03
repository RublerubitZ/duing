import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  ApiError,
  createApiClient,
  registerUnauthorizedHandler,
  notifyUnauthorized,
} from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { SessionExpiryHandler } from '@/app/_components/SessionExpiryHandler';

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, back: vi.fn(), replace: vi.fn() }),
}));

const skipSpy = vi.fn();
// 팩토리는 호이스팅되어 skipSpy 선언보다 먼저 평가될 수 있다 — pushSpy 와 같은 이유로 지연 참조한다.
vi.mock('@/app/_lib/backDismiss', () => ({
  skipNextOverlayReclaim: (...args: unknown[]) => skipSpy(...args),
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
  // 등록 → null 순서로 비운다 — 소비되지 않은 보류 통지가 다음 테스트의 마운트 시점에
  // 흘러들면 아무도 발생시키지 않은 세션 종료가 재생된다.
  registerUnauthorizedHandler(() => {});
  registerUnauthorizedHandler(null);
  pushSpy.mockReset();
  skipSpy.mockReset();
  // 시드 전 초기 상태로 되돌린다(replace) — 앞선 테스트의 isVerified 가 남으면 다음 테스트가
  // 확정된 종료를 물려받아 중복 가드에 걸린다.
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  window.history.replaceState({}, '', '/');
});
afterAll(() => server.close());

describe('API 401 감지 (afterResponse)', () => {
  it('Cookie 요청이 401 이고 자동 갱신까지 실패하면 등록된 핸들러를 호출한다', async () => {
    const handler = vi.fn();
    registerUnauthorizedHandler(handler);

    server.use(
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ message: '인증이 필요합니다.' }, { status: 401 }),
      ),
      // 401 은 이제 자동 갱신을 먼저 시도한다 — 갱신도 401 이어야 세션 만료가 확정된다.
      http.post(`${BASE}/auth/web/refresh`, () =>
        HttpResponse.json({ message: '만료', code: 'AUTH_SESSION_EXPIRED' }, { status: 401 }),
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
  let rendered: ReturnType<typeof render>;
  const webLogoutSpy = vi.fn();

  function renderHandler() {
    rendered = render(
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>
          <ToastProvider>
            <SessionExpiryHandler />
          </ToastProvider>
        </ApiClientProvider>
      </QueryClientProvider>,
    );
    return rendered;
  }

  beforeEach(() => {
    webLogoutSpy.mockReset();
    server.use(
      http.post(`${BASE}/auth/web/logout`, () => {
        webLogoutSpy();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    queryClient = new QueryClient();
    renderHandler();
  });

  it('인증 상태에서 401 이 발생하면 세션 정리 후 현재 경로를 next로 보존해 로그인으로 이동한다', async () => {
    window.history.replaceState({}, '', '/clubs?tab=mine');
    useAuthStore.setState({ status: 'authenticated', isVerified: true });

    act(() => notifyUnauthorized());

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(pushSpy).toHaveBeenCalledWith('/login?next=%2Fclubs%3Ftab%3Dmine');
    expect(await screen.findByText(/세션이 만료/)).toBeInTheDocument();
  });

  it('동시다발 401 에도 중복 토스트·이동이 발생하지 않는다', () => {
    // 토스트 개수는 ToastProvider 의 같은 문구 필터에도 1이 나온다 — 중복 가드가 실제로
    // 받는 부수효과(이동·캐시 비움)의 횟수를 함께 단언해야 회귀를 잡는다.
    const clearSpy = vi.spyOn(queryClient, 'clear');
    useAuthStore.setState({ status: 'authenticated', isVerified: true });

    act(() => {
      notifyUnauthorized();
      notifyUnauthorized();
      notifyUnauthorized();
    });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/세션이 만료/)).toHaveLength(1);
    clearSpy.mockRestore();
  });

  it('이미 종료가 확정(검증된 미인증)된 상태면 아무 동작도 하지 않는다', () => {
    useAuthStore.setState({ status: 'unauthenticated', isVerified: true, user: null });

    act(() => notifyUnauthorized());

    expect(pushSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/세션이 만료/)).not.toBeInTheDocument();
    expect(webLogoutSpy).not.toHaveBeenCalled();
  });

  // 시드(미검증 authenticated)는 로컬 이력·서버 힌트의 추정일 뿐이다. 여기서 부수효과를 열면
  // 스텔·위조 신호 하나가 로그인한 적 없는 방문자를 로그인 페이지로 튕겨낸다(§9.1).
  it('[metric 7] 시드된(미검증) authenticated 에서 종료 통지가 와도 토스트·이동·로그아웃 요청이 없다', async () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: false, user: null });

    act(() => notifyUnauthorized());

    // 상태 정리는 수행한다 — 확정 미인증으로 내려간다.
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().isVerified).toBe(true);
    expect(screen.queryByText(/세션이 만료/)).not.toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
    // 서버 로그아웃은 비동기라 "아직 안 왔을 뿐" 과 구분되도록 한 틱 흘려보낸 뒤 단언한다.
    await act(async () => {
      await Promise.resolve();
    });
    expect(webLogoutSpy).not.toHaveBeenCalled();
  });

  // 위 케이스의 짝 — 게이트가 검증된 세션까지 막아버리는 과교정을 잡는다.
  it('검증된 authenticated 에서의 종료 통지는 기존 만료 처리 전부를 수행한다', async () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: true });

    act(() => notifyUnauthorized());

    expect(screen.getByText(/세션이 만료/)).toBeInTheDocument();
    expect(pushSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(webLogoutSpy).toHaveBeenCalledTimes(1));
  });

  it('로그인 이동 직전에 오버레이 회수 스킵을 걸어 열린 시트의 back() 이 이동을 삼키지 않게 한다', () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: true });

    act(() => notifyUnauthorized());

    expect(skipSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    // push 보다 먼저 걸려야 한다 — 뒤면 회수 back() 이 먼저 나가 이동이 되돌려진다.
    expect(skipSpy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY).toBeLessThan(
      pushSpy.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY,
    );
  });

  it('이동이 없는 종료 통지(시드 상태·이미 확정된 미인증)에서는 회수 스킵도 걸지 않는다', () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: false });
    act(() => notifyUnauthorized());
    expect(pushSpy).not.toHaveBeenCalled();
    expect(skipSpy).not.toHaveBeenCalled();
  });

  it('보류 통지 flush 가 시드된 상태에서 일어나도 조용하다 — 부팅 중 만료의 등록 시점 재생', () => {
    // 핸들러 등록 전에 통지가 먼저 도착(콜드 부팅 중 만료) — 등록 시점에 flush 된다.
    rendered.unmount();
    useAuthStore.setState({ status: 'authenticated', isVerified: false, user: null });

    act(() => notifyUnauthorized());
    renderHandler();

    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      isVerified: true,
    });
    expect(screen.queryByText(/세션이 만료/)).not.toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  // 시드 전 초기 상태(미검증 미인증)에 도착한 종료도 확정으로 기록해야 한다 — 중복 가드를
  // status 만으로 두면 여기서 걸러져, 확정된 만료가 어디에도 남지 않고 이후 시드가 되살린다.
  it('시드 전 초기 상태(미검증 미인증)에 도착한 종료도 검증된 미인증으로 확정한다', () => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);

    act(() => notifyUnauthorized());

    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      isVerified: true,
    });
  });

  // 익명 방문자는 페이지 로드마다 이 통지를 만든다(익명 방문 → /users/me 401 → 쿠키 없는
  // refresh 401). 부수효과를 게이트 없이 열면 공개 트래픽 전체에 로그아웃 요청과 캐시 비움이 샌다.
  it('시드 전 초기 상태에서는 안내·이동·서버 로그아웃·캐시 비움을 하지 않는다', async () => {
    const clearSpy = vi.spyOn(queryClient, 'clear');
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    queryClient.setQueryData(['clubs', 'list'], [{ id: 1 }]);

    act(() => notifyUnauthorized());

    expect(pushSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/세션이 만료/)).not.toBeInTheDocument();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['clubs', 'list'])).toEqual([{ id: 1 }]);
    // 서버 로그아웃은 비동기라 "아직 안 왔을 뿐" 과 구분되도록 한 틱 흘려보낸 뒤 단언한다.
    await act(async () => {
      await Promise.resolve();
    });
    expect(webLogoutSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  // HttpOnly 쿠키(auth_hint 포함)는 JS 로 지울 수 없다 — 서버 로그아웃이 유일한 정리 경로다.
  it('만료 처리 시 서버 로그아웃을 호출해 HttpOnly 쿠키 정리를 위임한다', async () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: true });

    act(() => notifyUnauthorized());

    await waitFor(() => expect(webLogoutSpy).toHaveBeenCalledTimes(1));
  });

  it('서버 로그아웃이 실패해도 토스트와 로그인 이동은 그대로 진행된다', async () => {
    server.use(
      http.post(`${BASE}/auth/web/logout`, () =>
        HttpResponse.json({ message: '일시 오류' }, { status: 500 }),
      ),
    );
    useAuthStore.setState({ status: 'authenticated', isVerified: true });

    act(() => notifyUnauthorized());

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/세션이 만료/)).toBeInTheDocument();
  });

  it('만료 처리 시 이전 사용자 데이터(React Query 캐시)를 비운다', () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: true });
    queryClient.setQueryData(['users', 'me'], { id: 1, name: '테스트' });

    act(() => notifyUnauthorized());

    expect(queryClient.getQueryData(['users', 'me'])).toBeUndefined();
  });
});
