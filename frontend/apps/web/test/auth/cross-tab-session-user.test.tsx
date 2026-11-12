import { StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import posthog from 'posthog-js';

import {
  createApiClient,
  registerConnectivityAdapter,
  registerUnauthorizedHandler,
} from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

import { AuthSessionBootstrap } from '@/app/_components/AuthSessionBootstrap';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import {
  HAD_SESSION_KEY,
  SESSION_USER_KEY,
  consumeBootSessionRestore,
  recordLoggedInSessionUser,
  sessionChangeNotice,
  webConnectivityAdapter,
} from '@/app/_lib/authBoot';

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
  // 새로고침을 시작한 문서가 막아 둔 요청을 다음 테스트로 넘기지 않는다.
  registerConnectivityAdapter(null);
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

function renderBootstrap({ strictMode = false }: { strictMode?: boolean } = {}) {
  const tree = (
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthSessionBootstrap />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>
  );
  return render(strictMode ? <StrictMode>{tree}</StrictMode> : tree);
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

const SWITCHED_TEXT = '다른 탭에서 로그인 상태가 바뀌었어요. 이 화면에서는 저장되지 않아요.';
// 표지가 지워졌을 때 — 이 탭은 로그아웃인지 만료인지 가를 수 없어 결과만 말한다.
const ENDED_TEXT = '로그아웃되었어요. 이 화면에서는 저장되지 않아요.';
// 다른 탭이 공유 표지를 바꿨다는 알림만 보낸다(값은 그대로) — 저장소를 못 쓰는 사례·이미 둔 값에 쓴다.
const storageChanged = (newValue: string | null) =>
  window.dispatchEvent(new StorageEvent('storage', { key: SESSION_USER_KEY, newValue }));
// 다른 탭의 쓰기 흉내 — 같은 문서의 쓰기는 storage 이벤트를 만들지 않으므로 직접 보낸다.
function otherTabWrites(value: string | null) {
  if (value === null) window.localStorage.removeItem(SESSION_USER_KEY);
  else window.localStorage.setItem(SESSION_USER_KEY, value);
  storageChanged(value);
}
const REFRESHED_AT_KEY = 'duing:auth:web-refreshed-at';
// 공유 표지가 아닌 키(토큰 갱신 시각)를 다른 탭이 쓴 흉내.
function otherKeyWrites() {
  window.localStorage.setItem(REFRESHED_AT_KEY, String(Date.now()));
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: REFRESHED_AT_KEY,
      newValue: window.localStorage.getItem(REFRESHED_AT_KEY),
    }),
  );
}
const tabBecomesVisible = () => document.dispatchEvent(new Event('visibilitychange'));
// 판정 오류는 이제 새로고침 되풀이가 아니라 조용한 전면 실패로 나타난다 — 정상 탭의 요청은 그대로 나가야 한다.
async function expectRequestGoesOut() {
  const meRequestsBefore = meRequestCount;
  await expect(apiClient.users.me()).resolves.toMatchObject({ id: expect.any(Number) });
  expect(meRequestCount).toBe(meRequestsBefore + 1);
}
const pageRestored = () => window.dispatchEvent(new Event('pageshow'));

describe('공유 사용자 표지 — 쓰기', () => {
  it('부팅 확인이 끝나면 확인된 사용자 id 를 공유 표지에 쓴다', async () => {
    renderBootstrap();

    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('1'));
  });

  it('부팅 확인 전에는 공유 표지를 건드리지 않고 다른 탭의 값도 보지 않는다', async () => {
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

    // 아직 이 탭이 확인한 값이 없다 — 다른 탭의 값과 비교할 근거가 없다.
    act(() => {
      storageChanged('2');
      tabBecomesVisible();
    });
    expect(reloadSpy).not.toHaveBeenCalled();

    releaseMe();

    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('1'));
    act(() => {
      tabBecomesVisible();
    });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('이 탭에서 다른 계정으로 바뀌면 그 id 를 쓰고, 만료가 확정되면 표지를 지운다', async () => {
    await renderVerifiedMember();

    // 로그인 상태에서 다른 계정으로 로그인 — status·isVerified 는 그대로이고 user 만 바뀐다.
    act(() => useAuthStore.getState().setSession(OTHER_MEMBER));
    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('2'));
    // 자기 전환은 남의 전환이 아니다 — 확인한 값과 저장소가 같다.
    act(() => {
      tabBecomesVisible();
      pageRestored();
    });
    expect(reloadSpy).not.toHaveBeenCalled();

    // SessionExpiryHandler 의 확정 순서 그대로 — 동기 setState 로 내린 뒤 clearSession.
    act(() => {
      useAuthStore.setState({ status: 'unauthenticated', isVerified: true });
      void useAuthStore
        .getState()
        .clearSession()
        .catch(() => {});
    });
    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBeNull());
    act(() => {
      tabBecomesVisible();
      pageRestored();
    });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('저장소에 접근할 수 없어도 부팅 확인은 그대로 끝나고 신호가 와도 새로고침하지 않는다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwBlocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwBlocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(throwBlocked);

    renderBootstrap();

    await waitFor(() => expect(useAuthStore.getState().isVerified).toBe(true));
    act(() => {
      storageChanged('2');
      tabBecomesVisible();
      pageRestored();
    });
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe('공유 사용자 표지 — 다른 탭의 바뀜', () => {
  it('다른 탭이 다른 계정으로 로그인하면 요청을 막고 새로고침한다', async () => {
    await renderVerifiedMember();

    act(() => otherTabWrites('2'));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(SWITCHED_TEXT)).toBeInTheDocument();
    // 새로고침 응답을 기다리는 동안 이 문서의 요청은 바뀐 계정 쿠키로 나가지 않고, '인터넷 연결' 이 아니라 안내와 같은 문구로 실패한다.
    await expect(apiClient.users.me()).rejects.toMatchObject({
      code: 'NETWORK',
      message: SWITCHED_TEXT,
    });
    expect(meRequestCount).toBe(1);
    // 떠나는 문서는 로그인도 막는다(#1694) — 로그인 화면은 NETWORK 면 이 문구를 그대로 보인다.
    await expect(
      apiClient.auth.login({ studentId: OTHER_MEMBER.studentId, password: 'x', rememberMe: false }),
    ).rejects.toMatchObject({ code: 'NETWORK', message: SWITCHED_TEXT });
  });

  it('다른 탭이 로그아웃하거나 세션 만료로 표지를 지우면 로그아웃 안내로 막고 새로고침한다', async () => {
    await renderVerifiedMember();

    act(() => otherTabWrites(null));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(ENDED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(SWITCHED_TEXT)).toBeNull();
    await expect(apiClient.users.me()).rejects.toMatchObject({
      code: 'NETWORK',
      message: ENDED_TEXT,
    });
  });

  it('막힌 문서는 처음 막은 원인의 문구를 유지한다 — 그 뒤 다른 탭이 로그인해도 안내·막힌 요청 모두 로그아웃 문구', async () => {
    const user = userEvent.setup();
    await renderVerifiedMember();
    act(() => otherTabWrites(null));
    expect(await screen.findByText(ENDED_TEXT)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '알림 닫기' }));
    await waitFor(() => expect(screen.queryByText(ENDED_TEXT)).toBeNull());

    // 다시 계산하면 계정 전환 문구가 겹쳐 뜬다 — 처음 문구 하나만 다시 띄운다.
    act(() => otherTabWrites('3'));
    expect(await screen.findAllByText(ENDED_TEXT)).toHaveLength(1);
    expect(screen.queryByText(SWITCHED_TEXT)).toBeNull();
    await expect(apiClient.users.me()).rejects.toMatchObject({
      code: 'NETWORK',
      message: ENDED_TEXT,
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('다른 탭이 저장소를 통째로 비우면(key null) 확인해 새로고침한다', async () => {
    await renderVerifiedMember();

    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('언마운트하면 리스너를 모두 떼어 신호가 와도 새로고침하지 않는다', async () => {
    const { unmount } = await renderVerifiedMember();
    unmount();

    act(() => {
      otherTabWrites('2');
      tabBecomesVisible();
      pageRestored();
    });

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('놓친 storage 이벤트는 탭이 다시 보일 때 값을 다시 읽어 메운다', async () => {
    await renderVerifiedMember();
    window.localStorage.setItem(SESSION_USER_KEY, '2');

    act(() => {
      tabBecomesVisible();
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('뒤로 가기 캐시에서 복원되면 값을 다시 읽어 메운다', async () => {
    await renderVerifiedMember();
    window.localStorage.setItem(SESSION_USER_KEY, '2');

    act(() => {
      pageRestored();
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('공유 표지가 이 탭이 확인한 값과 같으면 신호가 와도 새로고침하지 않는다', async () => {
    await renderVerifiedMember();

    act(() => {
      otherTabWrites('1');
      tabBecomesVisible();
    });

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('다른 키의 storage 이벤트(토큰 갱신 등)로는 공유 표지가 달라져 있어도 확인하지 않는다', async () => {
    await renderVerifiedMember();
    // 값만 바뀐 상태 — 확인은 공유 표지의 이벤트·다시 보임·복원에서만 한다.
    window.localStorage.setItem(SESSION_USER_KEY, '2');

    act(() => otherKeyWrites());

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(SWITCHED_TEXT)).toBeNull();
  });

  it('비로그인 확정 탭은 같은 비로그인이면 그대로 두고, 다른 탭이 로그인하면 새로고침한다', async () => {
    await renderVerifiedMember();
    act(() => {
      void useAuthStore
        .getState()
        .clearSession()
        .catch(() => {});
    });
    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBeNull());

    act(() => {
      tabBecomesVisible();
    });
    expect(reloadSpy).not.toHaveBeenCalled();

    act(() => otherTabWrites('2'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('확인 뒤 저장소 읽기만 실패하면 비교하지 않는다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    await renderVerifiedMember();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwBlocked);
    await expectRequestGoesOut();

    act(() => {
      storageChanged('2');
      tabBecomesVisible();
    });

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('쓰기에 실패한 탭은 남은 옛 값을 지워 다른 탭이 알아채게 하고, 자기는 비교하지 않아 요청이 나가고 새로고침하지 않는다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    window.localStorage.setItem(SESSION_USER_KEY, '9');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwBlocked);

    renderBootstrap();
    // 옛 값(9)이 남으면 9 를 확인한 다른 탭은 이 탭의 계정(1)을 모른다 — 지워야 그 탭들이 새로고침해 다시 확인한다.
    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBeNull());
    expect(useAuthStore.getState().isVerified).toBe(true);
    await expectRequestGoesOut();

    act(() => {
      tabBecomesVisible();
      storageChanged(null);
    });

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('쓰기에 실패해도 표지가 이미 쓰려던 값이면 지우지 않는다 — 같은 사용자를 확인한 다른 탭을 흔들지 않는다', async () => {
    window.localStorage.setItem(SESSION_USER_KEY, '1');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwBlocked);

    renderBootstrap();
    // 쓰기를 시도한 뒤라야 '그대로' 가 거저 나오지 않는다 — 지우기는 같은 effect 안에서 곧바로 일어난다.
    await waitFor(() => expect(setItemSpy).toHaveBeenCalledWith(SESSION_USER_KEY, '1'));

    expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('1');
  });

  it('로그인 직후 쓰기도 실패하면 옛 값을 지우고 이 탭은 비교하지 않는다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    await renderVerifiedMember();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwBlocked);

    recordLoggedInSessionUser(OTHER_MEMBER.id);

    expect(window.localStorage.getItem(SESSION_USER_KEY)).toBeNull();
    expect(sessionChangeNotice()).toBeNull();
    await expectRequestGoesOut();
  });

  it('알려진 한계 — 확인 뒤 쓰기에 실패한 탭은 그때부터 비교하지 않는다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    await renderVerifiedMember();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwBlocked);
    act(() => useAuthStore.getState().setSession(OTHER_MEMBER));
    setItemSpy.mockRestore();
    // 이 탭이 쓰던 옛 값(1)은 지운다 — 1 을 확인한 다른 탭이 이 탭의 전환(2)을 알아채게.
    expect(window.localStorage.getItem(SESSION_USER_KEY)).toBeNull();
    await expectRequestGoesOut();

    act(() => otherTabWrites('3'));

    // 이 탭은 B 인데 비교를 멈춘다 — 쓰지 못한 값으로 비교하면 읽기만 되는 저장소에서 새로고침이 되풀이된다.
    expect(reloadSpy).not.toHaveBeenCalled();
    await expectRequestGoesOut();
  });

  it('신호가 겹쳐도 새로고침·안내는 문서당 한 번이다', async () => {
    await renderVerifiedMember();
    window.localStorage.setItem(SESSION_USER_KEY, '2');

    act(() => {
      otherTabWrites('2');
      tabBecomesVisible();
      pageRestored();
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findAllByText(SWITCHED_TEXT)).toHaveLength(1);
  });

  it('막힌 문서는 신호마다 닫힌 안내만 다시 띄우고, 안내의 새로고침 버튼으로 다시 불러오며 누른 뒤에도 안내가 남는다', async () => {
    const user = userEvent.setup();
    await renderVerifiedMember();
    act(() => otherTabWrites('2'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(SWITCHED_TEXT)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '알림 닫기' }));
    // 퇴장 전이(200ms) 뒤에 사라진다.
    await waitFor(() => expect(screen.queryByText(SWITCHED_TEXT)).toBeNull());

    // 다른 키의 쓰기로는 닫힌 안내를 다시 띄우지 않는다.
    act(() => otherKeyWrites());
    expect(screen.queryByText(SWITCHED_TEXT)).toBeNull();

    act(() => {
      tabBecomesVisible();
    });
    expect(await screen.findAllByText(SWITCHED_TEXT)).toHaveLength(1);

    // 떠 있는 같은 문구는 ToastProvider 가 거른다.
    act(() => otherTabWrites('3'));
    expect(await screen.findAllByText(SWITCHED_TEXT)).toHaveLength(1);
    // 나가기 확인 창을 신호마다 띄우지 않는다.
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '새로고침' }));
    expect(reloadSpy).toHaveBeenCalledTimes(2);
    // 나가기 확인 창을 취소해 문서가 남으면 — 누른 토스트의 퇴장 전이가 끝난 뒤에도 안내가 하나 남는다.
    await waitFor(() => expect(document.querySelectorAll('[data-exiting]')).toHaveLength(0));
    expect(screen.getAllByText(SWITCHED_TEXT)).toHaveLength(1);
  });

  it('막힌 문서는 늦게 끝난 세션 정리로 공유 표지·had-session 을 지우거나 PostHog 신원을 끊지 않는다', async () => {
    const resetSpy = vi.spyOn(posthog, 'reset').mockImplementation(() => {});
    await renderVerifiedMember();
    expect(window.localStorage.getItem(HAD_SESSION_KEY)).toBe('1');
    act(() => otherTabWrites('2'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // 막히기 전에 나간 요청(예: 비밀번호 변경 성공)이 끝나며 이 탭의 세션을 지운다.
    act(() => {
      void useAuthStore
        .getState()
        .clearSession()
        .catch(() => {});
    });

    expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('2');
    expect(window.localStorage.getItem(HAD_SESSION_KEY)).toBe('1');
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('다른 탭이 표지를 바꿨는데 storage 이벤트를 아직 못 받았어도 요청은 보내는 순간 막힌다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    await renderVerifiedMember();
    // 깨어난 동결 탭 흉내 — 저장소엔 다른 탭의 쓰기가 보이지만 이 문서는 아직 이벤트를 처리하지 않았다.
    window.localStorage.setItem(SESSION_USER_KEY, '2');

    await expect(apiClient.users.me()).rejects.toMatchObject({
      code: 'NETWORK',
      message: SWITCHED_TEXT,
    });
    expect(meRequestCount).toBe(1);
    expect(reloadSpy).not.toHaveBeenCalled();

    // 새로고침은 지금처럼 이벤트가 맡는다.
    act(() => storageChanged('2'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('다른 탭이 표지를 지웠는데 이벤트를 아직 못 받았으면 요청은 로그아웃 문구로 막힌다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    await renderVerifiedMember();
    window.localStorage.removeItem(SESSION_USER_KEY);

    await expect(apiClient.users.me()).rejects.toMatchObject({
      code: 'NETWORK',
      message: ENDED_TEXT,
    });
    expect(meRequestCount).toBe(1);
  });

  it('요청이 서버에 닿은 사이 다른 탭이 사용자를 바꾸고 401 이 오면 갱신·재시도 없이 실패한다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    await renderVerifiedMember();
    let refreshRequestCount = 0;
    server.use(
      http.get(`${BASE}/users/me`, () => {
        meRequestCount += 1;
        window.localStorage.setItem(SESSION_USER_KEY, '2');
        return HttpResponse.json(
          { ok: false, data: null, message: '인증이 필요합니다.' },
          { status: 401 },
        );
      }),
      http.post(`${BASE}/auth/web/refresh`, () => {
        refreshRequestCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(apiClient.users.me()).rejects.toMatchObject({ status: 401 });
    expect(refreshRequestCount).toBe(0);
    expect(meRequestCount).toBe(2);
  });

  it('공유 표지가 이 탭이 확인한 값과 같으면 요청은 그대로 나간다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    await renderVerifiedMember();

    await expect(apiClient.users.me()).resolves.toMatchObject({ id: 1 });
    expect(meRequestCount).toBe(2);
  });

  it('부팅 확인 전에는 다른 탭의 표지가 달라도 요청이 나간다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    window.localStorage.setItem(SESSION_USER_KEY, '2');
    let releaseBootCheck: () => void = () => {};
    const bootCheckGate = new Promise<void>((resolve) => {
      releaseBootCheck = resolve;
    });
    server.use(
      http.get(`${BASE}/users/me`, async () => {
        meRequestCount += 1;
        if (meRequestCount === 1) await bootCheckGate;
        return HttpResponse.json({ ok: true, data: MEMBER, message: null });
      }),
    );

    try {
      renderBootstrap();
      // 부팅 확인 요청이 서버에 붙잡힌 동안 — 이 탭은 아직 아무 사용자도 확인하지 않았다.
      await waitFor(() => expect(meRequestCount).toBe(1));
      await expect(apiClient.users.me()).resolves.toMatchObject({ id: 1 });
      expect(meRequestCount).toBe(2);
    } finally {
      releaseBootCheck();
    }
  });

  it('StrictMode 이중 마운트 뒤에도 확인값이 남아 다른 탭의 바뀜을 요청 시점에 막는다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    renderBootstrap({ strictMode: true });
    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('1'));
    window.localStorage.setItem(SESSION_USER_KEY, '2');

    await expect(apiClient.users.me()).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('언마운트하면 이 탭이 확인한 값을 지워 그 뒤에는 요청을 막지 않는다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    const { unmount } = await renderVerifiedMember();
    unmount();
    window.localStorage.setItem(SESSION_USER_KEY, '2');

    expect(sessionChangeNotice()).toBeNull();
    await expect(apiClient.users.me()).resolves.toMatchObject({ id: 1 });
  });

  it('이벤트를 아직 못 받은 탭에서도 로그인 요청은 나가고, 로그인이 먼저 끝나면 늦게 온 이벤트로 새로고침하지 않는다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    await renderVerifiedMember();
    let loginRequestCount = 0;
    server.use(
      http.post(`${BASE}/auth/web/login`, () => {
        loginRequestCount += 1;
        return HttpResponse.json({ ok: true, data: { user: OTHER_MEMBER }, message: null });
      }),
    );
    // 다른 탭이 방금 다른 계정(3)으로 로그인했지만 이 문서는 아직 storage 이벤트를 처리하지 않았다.
    window.localStorage.setItem(SESSION_USER_KEY, '3');

    // 이 탭의 사용자 데이터를 보내는 요청은 그대로 막힌다.
    await expect(apiClient.users.me()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(meRequestCount).toBe(1);
    await expect(
      apiClient.auth.login({ studentId: OTHER_MEMBER.studentId, password: 'x', rememberMe: false }),
    ).resolves.toMatchObject({ id: OTHER_MEMBER.id });
    expect(loginRequestCount).toBe(1);

    // (가) 로그인 응답이 먼저 — 로그인 화면처럼 세션을 열면 이 탭이 표지를 B(2)로 쓴다.
    act(() => useAuthStore.getState().setSession(OTHER_MEMBER));
    await waitFor(() => expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('2'));
    // 밀려 있던 옛 이벤트는 저장소의 지금 값(B)을 읽어 새로고침하지 않는다.
    act(() => storageChanged('3'));
    expect(reloadSpy).not.toHaveBeenCalled();
    await expectRequestGoesOut();
  });

  it('로그인 응답보다 다른 탭의 이벤트가 먼저면 막힌 문서는 표지를 쓰지 않고, 로그인 화면의 쓰기가 표지를 새 계정으로 맞춘다', async () => {
    registerConnectivityAdapter(webConnectivityAdapter);
    await renderVerifiedMember();
    let markLoginArrived = () => {};
    const loginArrived = new Promise<void>((resolve) => {
      markLoginArrived = resolve;
    });
    let releaseLoginResponse = () => {};
    const loginResponseHeld = new Promise<void>((resolve) => {
      releaseLoginResponse = resolve;
    });
    server.use(
      http.post(`${BASE}/auth/web/login`, async () => {
        markLoginArrived();
        await loginResponseHeld;
        return HttpResponse.json({ ok: true, data: { user: OTHER_MEMBER }, message: null });
      }),
    );
    const loginResult = apiClient.auth.login({
      studentId: OTHER_MEMBER.studentId,
      password: 'x',
      rememberMe: false,
    });
    await loginArrived;

    // (나) 로그인 POST 가 서버에 닿은 사이 다른 탭(3)의 이벤트가 먼저 온다 — 이 문서는 막고 새로고침을 시작한다.
    act(() => otherTabWrites('3'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    releaseLoginResponse();
    await expect(loginResult).resolves.toMatchObject({ id: OTHER_MEMBER.id });

    // 막힌 문서의 부트스트랩은 세션이 열려도 표지를 쓰지 않는다 — 쿠키는 이미 B(2)인데 다른 탭엔 옛 값(3)이 남는다.
    act(() => useAuthStore.getState().setSession(OTHER_MEMBER));
    expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('3');
    // 로그인 화면이 이동 전에 쓰는 값이 그 틈을 메운다.
    recordLoggedInSessionUser(OTHER_MEMBER.id);
    expect(window.localStorage.getItem(SESSION_USER_KEY)).toBe('2');
    // 확인값을 맞춰도 떠나는 문서의 요청은 계속 막힌다.
    await expect(apiClient.users.me()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
