import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import posthog from 'posthog-js';

import { createApiClient, registerUnauthorizedHandler } from '@duing/api';
import { ApiClientProvider, useMeQuery, userQueryKeys } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

import { AuthSessionBootstrap } from '@/app/_components/AuthSessionBootstrap';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { consumeBootSessionRestore, startBootSessionRestore } from '@/app/_lib/authBoot';

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

let queryClient: QueryClient;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  // 앱과 같은 기본값(staleTime 30초)을 준다 — 부팅 복원이 채운 캐시가 곧바로 stale 이면
  // 뒤따라 마운트되는 소비자가 다시 요청해, 중복 제거를 측정할 수 없다.
  queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
});
afterEach(() => {
  server.resetHandlers();
  refreshCallCount = 0;
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  window.localStorage.clear();
  // 선점 프로미스는 모듈 스코프 1회 가드다 — 소비해서 비우지 않으면 다음 테스트의
  // startBootSessionRestore 가 no-op 이 되고, 부트스트랩이 남의 요청을 물려받는다.
  consumeBootSessionRestore();
  // 이 파일은 종료 핸들러를 등록하지 않는다 — 사이드 채널에 쌓인 보류 통지를 비워
  // 다음 테스트가 남의 세션 종료를 물려받지 않게 한다(보류는 등록 시점에 소비된다).
  registerUnauthorizedHandler(() => {});
  registerUnauthorizedHandler(null);
});
afterAll(() => server.close());

// 알림은 "이 브라우저에서 세션이 살아 있던 적이 있는" 사용자에게만 뜬다.
function givenPreviousSession() {
  window.localStorage.setItem('duing:had-session', '1');
}

// 갱신까지 401 — 세션이 실제로 끝난 상황. 종료 판정은 SessionExpiryHandler 의 몫이라
// 이 컴포넌트만 렌더한 구성에서는 사이드 채널을 받는 쪽이 없다.
let refreshCallCount = 0;

function givenExpiredSession() {
  server.use(
    http.get(`${BASE}/users/me`, () =>
      HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
    ),
    http.post(`${BASE}/auth/web/refresh`, () => {
      refreshCallCount += 1;
      return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
    }),
  );
}

// 스토어 전이만 단언하는 테스트는 401→갱신 체인이 아직 도는 중에 끝날 수 있다. 그 상태로
// afterEach 의 resetHandlers 를 지나면 뒤늦은 refresh 가 onUnhandledRequest:'error' 에 걸리고,
// 보류 플래그 쓰기가 정리 뒤에 떨어진다. 체인이 닫힌 걸 보고 끝낸다.
async function waitForRefreshSettled() {
  await waitFor(() => expect(refreshCallCount).toBe(1));
}

// providers.tsx 와 같은 순서로 렌더한다 — 부트스트랩이 먼저, 소비자가 뒤. 이 순서가 뒤집히면
// 소비자가 먼저 요청을 내 중복 제거가 성립하지 않는다.
function renderBootstrap(consumer?: ReactNode) {
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthSessionBootstrap />
          {consumer}
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

// 헤더(UserMenu)·마이페이지 등 부팅 직후 마운트되는 /users/me 소비자를 대표한다.
function MeConsumer() {
  const meQuery = useMeQuery();
  return <span data-testid="me-name">{meQuery.data?.name ?? ''}</span>;
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
    // 서버 응답으로 확인된 상태 — 이후 시드가 덮지 못하고, 만료 처리도 이 값을 함께 본다.
    expect(useAuthStore.getState().isVerified).toBe(true);
  });

  // 레버 1: 부팅 1회분 요청은 모듈 스코프에서 이미 나가 있다. 부트스트랩이 이를 소비하지 않고
  // 자기 요청을 또 내면 매 부팅마다 /users/me 가 두 번 나간다(전환기 중복).
  it('선점된 부팅 요청을 소비하고 새 요청을 내지 않는다', async () => {
    let requestCount = 0;
    server.use(
      http.get(`${BASE}/users/me`, () => {
        requestCount += 1;
        return HttpResponse.json({ ok: true, data: TEST_USER, message: null });
      }),
    );

    startBootSessionRestore(apiClient);
    // 요청은 렌더(하이드레이션)보다 먼저 나간다 — 이 단언이 없으면 선점이 no-op 이어도 통과한다.
    await waitFor(() => expect(requestCount).toBe(1));

    renderBootstrap();

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(requestCount).toBe(1);
  });

  // 부팅 복원과 화면의 me 소비자(헤더·마이페이지 등)는 같은 /users/me 다. 복원 요청을 me 쿼리의
  // 첫 조회로 등록하지 않으면, 하이드레이션 직후 마운트된 소비자가 같은 요청을 한 번 더 낸다.
  it('부팅 복원을 me 쿼리 조회로 등록해 소비자가 요청을 다시 내지 않는다', async () => {
    let requestCount = 0;
    let releaseResponse = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    server.use(
      http.get(`${BASE}/users/me`, async () => {
        requestCount += 1;
        await responseGate;
        return HttpResponse.json({ ok: true, data: TEST_USER, message: null });
      }),
    );

    // 로컬 이력이 있는 재방문 = 시드된 authenticated — 소비자 쿼리가 첫 마운트부터 열린다(최악의 경우).
    act(() => useAuthStore.getState().seedSession('authenticated'));
    startBootSessionRestore(apiClient);
    await waitFor(() => expect(requestCount).toBe(1));

    renderBootstrap(<MeConsumer />);

    // 소비자가 자기 요청을 냈다면 응답을 풀기 전에 이미 2건이다.
    await act(async () => {
      releaseResponse();
      await waitFor(() => expect(screen.getByTestId('me-name')).toHaveTextContent('홍길동'));
    });

    expect(requestCount).toBe(1);
    expect(queryClient.getQueryData(userQueryKeys.me())).toEqual(TEST_USER);
  });

  // 이 PR 의 핵심 계약 변경. 401 봉투는 진짜 만료와 일시 장애가 완전히 같아서, 이 컴포넌트가
  // 자체 판정하면 갱신 실패의 절반(403·5xx·타임아웃·오프라인)을 로그아웃으로 오판한다.
  // 종료는 사이드 채널을 받는 SessionExpiryHandler 만 확정한다.
  it('/users/me 401 이 와도 스스로 세션을 끝내지 않는다', async () => {
    givenExpiredSession();
    givenPreviousSession();

    renderBootstrap();

    // 알림이 뜰 만큼 catch 가 돌았는데도 상태는 그대로다 — 확정은 다른 단위의 책임이다.
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      isVerified: false,
      user: null,
    });
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
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      isVerified: false,
      user: null,
    });
  });

  it('/users/me 네트워크 오류를 인증 만료로 오판하지 않는다', async () => {
    server.use(http.get(`${BASE}/users/me`, () => HttpResponse.error()));

    givenPreviousSession();
    renderBootstrap();

    expect(await screen.findByRole('alert')).toHaveTextContent('세션을 확인하지 못했습니다');
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      isVerified: false,
      user: null,
    });
  });

  it('세션을 가진 적 없는 방문자에게는 확인 실패를 알리지 않는다', async () => {
    server.use(http.get(`${BASE}/users/me`, () => HttpResponse.error()));

    renderBootstrap();

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      isVerified: false,
      user: null,
    });
  });

  // 세션 이력은 종료 전이에서 지워진다 — 종료를 확정하는 쪽(SessionExpiryHandler)과 맞물린
  // 결과는 통합 테스트(session-judgment)가 검증한다.
  it('세션 종료 전이에서 이력을 지운다', async () => {
    givenPreviousSession();
    givenExpiredSession();

    renderBootstrap();
    act(() =>
      useAuthStore.setState({ status: 'unauthenticated', isVerified: true, user: null }),
    );

    await waitFor(() => expect(window.localStorage.getItem('duing:had-session')).toBeNull());
    await waitForRefreshSettled();
  });

  // 시드(미검증 authenticated)는 "확인된 세션" 이 아니다. 여기서 플래그를 다시 심으면 스텔
  // 플래그가 스스로를 영속시켜, 세션이 끝난 뒤에도 매 부팅 시드가 되살아난다.
  it('시드된(미검증) authenticated 상태에서는 이력을 다시 심지 않는다', async () => {
    givenExpiredSession();
    act(() => useAuthStore.getState().seedSession('authenticated'));

    renderBootstrap();
    await waitForRefreshSettled();

    expect(window.localStorage.getItem('duing:had-session')).toBeNull();
    // 확정은 종료 핸들러의 몫이고 이 구성엔 없다 — 시드가 그대로 남는다.
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      isVerified: false,
    });
  });

  // 로그인 뮤테이션은 이 컴포넌트를 거치지 않고 스토어에 직접 세션을 세운다. 그 경로에서 이력이
  // 남지 않으면, 방금 로그인한 사용자가 새로고침 중 일시 오류를 만났을 때 알림도 재시도 버튼도
  // 받지 못하고 조용히 멈춘다.
  it('부트스트랩 밖에서 세션이 서도 이력을 남긴다', async () => {
    givenExpiredSession();

    renderBootstrap();
    act(() => useAuthStore.getState().setSession(TEST_USER));

    await waitFor(() =>
      expect(window.localStorage.getItem('duing:had-session')).toBe('1'),
    );
    await waitForRefreshSettled();
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
  // 검증된 authenticated(setSession) → 검증된 unauthenticated(clearSession) — reset 이 도는 유일한 쌍.
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

  it('익명 방문자의 확정(미검증 → 검증된 미인증)에서는 익명 distinct_id 를 갈아치우지 않는다', async () => {
    const resetSpy = vi.spyOn(posthog, 'reset').mockImplementation(() => {});
    givenExpiredSession();

    renderBootstrap();
    act(() =>
      useAuthStore.setState({ status: 'unauthenticated', isVerified: true, user: null }),
    );

    await waitFor(() => expect(useAuthStore.getState().isVerified).toBe(true));
    expect(resetSpy).not.toHaveBeenCalled();
    resetSpy.mockRestore();
    await waitForRefreshSettled();
  });

  // 시드가 틀렸던 방문자(미검증 authenticated → 확정 미인증)는 로그인한 적 없는 익명이다.
  // 여기서 reset 을 걸면 가입 전 행동과 가입 후 identify 의 연결이 끊긴다.
  it('시드가 무너진 전이(미검증 authenticated → 검증된 미인증)에서는 초기화하지 않는다', async () => {
    const resetSpy = vi.spyOn(posthog, 'reset').mockImplementation(() => {});
    givenExpiredSession();

    renderBootstrap();
    act(() => useAuthStore.setState({ status: 'authenticated', isVerified: false }));
    act(() =>
      useAuthStore.setState({ status: 'unauthenticated', isVerified: true, user: null }),
    );

    await waitFor(() => expect(useAuthStore.getState().isVerified).toBe(true));
    expect(resetSpy).not.toHaveBeenCalled();
    resetSpy.mockRestore();
    await waitForRefreshSettled();
  });

  // 부팅 요청이 도는 중 로그아웃하면, 그 요청은 종료보다 먼저 나간 옛 상태의 답이다. 늦게 도착한
  // 200 으로 세션을 되살리면 다음 401 사슬에서 "세션이 만료되었어요" 안내가 뜬다(의도적 로그아웃인데).
  it('확정된 종료 뒤 도착한 늦은 200 응답은 세션을 되살리지 않는다', async () => {
    const identifySpy = vi.spyOn(posthog, 'identify').mockImplementation(() => {});
    let requestReceived = false;
    let responseSent = false;
    // 고정 지연은 waitFor 폴링 간격(50ms)에 밀려 응답이 먼저 도착할 수 있다 — 테스트가 직접
    // 여는 게이트로 "로그아웃이 먼저" 를 확정한다.
    let releaseResponse = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    server.use(
      http.get(`${BASE}/users/me`, async () => {
        requestReceived = true;
        await responseGate;
        responseSent = true;
        return HttpResponse.json({ ok: true, data: TEST_USER, message: null });
      }),
    );

    renderBootstrap();
    // 응답이 아직 안 온 사이에 로그아웃해야 경합이 재현된다.
    await waitFor(() => expect(requestReceived).toBe(true));
    await act(async () => {
      await useAuthStore.getState().clearSession();
    });

    // 응답이 실제로 나갔고(responseSent) 그 뒤 then 체인까지 돈 시점에 단언한다 — 응답이
    // 도착도 하지 않아 통과하는 위양성 방지.
    await act(async () => {
      releaseResponse();
      await waitFor(() => expect(responseSent).toBe(true));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      isVerified: true,
      user: null,
    });
    // 스토어와 같은 이유로 캐시에도 남기지 않는다 — 공용 단말에서 로그아웃한 사용자의 정보가
    // 다음 사용자의 화면에 뜨지 않아야 한다.
    expect(queryClient.getQueryData(userQueryKeys.me())).toBeUndefined();
    expect(identifySpy).not.toHaveBeenCalled();
    identifySpy.mockRestore();
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
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      isVerified: false,
      user: null,
    });
  });

  // 선점 프로미스는 1회용이다 — 재시도가 이미 실패한 그 프로미스를 다시 붙들면 영원히 실패한다.
  it('일시 오류 후 사용자가 다시 시도하면 새 요청으로 세션을 복원한다', async () => {
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
    startBootSessionRestore(apiClient);
    renderBootstrap();
    await user.click(await screen.findByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(useAuthStore.getState().user).toEqual(TEST_USER);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requestCount).toBe(2);
  });
});
