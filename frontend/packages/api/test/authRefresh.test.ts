import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { setStorage, type Storage } from '@duing/storage';

import { createApiClient } from '../src/client';
import { registerUnauthorizedHandler } from '../src/unauthorized-context';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();
const unauthorizedHandler = vi.fn();

// coordinator 는 @duing/storage(getStorage) 경유로 "최근 갱신 시각" 을 읽고 쓴다.
// localStorage.clear() 로는 격리되지 않으므로 Map 스텁을 주입하고 매 테스트 초기화한다.
// (10초 생략 창이 테스트 간 새지 않도록 store.clear 필수 — authLogout.test.ts 전례)
const store = new Map<string, string>();
const memoryStorage: Storage = {
  getItem: async (key) => store.get(key) ?? null,
  setItem: async (key, value) => {
    store.set(key, value);
  },
  removeItem: async (key) => {
    store.delete(key);
  },
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  unauthorizedHandler.mockClear();
});
afterAll(() => server.close());

function cookieClient() {
  return createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });
}

beforeEach(() => {
  setStorage(memoryStorage);
  store.clear();
  registerUnauthorizedHandler(unauthorizedHandler);
});

describe('쿠키 모드 401 자동 갱신', () => {
  it('401 을 만나면 refresh 후 원요청을 재시도해 성공을 돌려주고 세션 종료를 알리지 않는다', async () => {
    let meCallCount = 0;
    server.use(
      http.get(`${BASE_URL}/users/me`, () => {
        meCallCount += 1;
        if (meCallCount === 1) {
          return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
        }
        return HttpResponse.json({
          ok: true,
          data: { id: 1, studentId: '20261234', name: '테스터', phone: '010-0000-0000', grade: 'FRESHMAN', role: 'STUDENT' },
          message: null,
        });
      }),
      http.post(`${BASE_URL}/auth/web/refresh`, () => new HttpResponse(null, { status: 204 })),
    );

    const me = await cookieClient().users.me();

    expect(me.studentId).toBe('20261234');
    expect(meCallCount).toBe(2);
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('refresh 가 401 이면 세션 종료를 알린다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료', code: 'AUTH_SESSION_EXPIRED' }, { status: 401 })),
    );

    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 401 });
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
  });

  it('refresh 가 5xx 면 세션을 끝내지 않고 원 401 을 그대로 표면화한다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () => new HttpResponse(null, { status: 503 })),
    );

    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 401 });
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('동시 401 여러 건도 refresh 는 한 번만 나간다', async () => {
    let refreshCallCount = 0;
    let meCallCount = 0;
    server.use(
      http.get(`${BASE_URL}/users/me`, () => {
        meCallCount += 1;
        if (meCallCount <= 2) {
          return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
        }
        return HttpResponse.json({
          ok: true,
          data: { id: 1, studentId: '20261234', name: '테스터', phone: '010-0000-0000', grade: 'FRESHMAN', role: 'STUDENT' },
          message: null,
        });
      }),
      http.post(`${BASE_URL}/auth/web/refresh`, async () => {
        refreshCallCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const client = cookieClient();
    const results = await Promise.all([client.users.me(), client.users.me()]);

    expect(results).toHaveLength(2);
    expect(refreshCallCount).toBe(1);
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('웹 로그인·로그아웃·refresh 자신의 401 에는 갱신을 시도하지 않는다', async () => {
    let refreshCallCount = 0;
    server.use(
      http.post(`${BASE_URL}/auth/web/login`, () =>
        HttpResponse.json({ ok: false, data: null, message: '자격 오류' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () => {
        refreshCallCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(
      cookieClient().auth.login({ studentId: '20261234', password: 'x', rememberMe: false }),
    ).rejects.toMatchObject({ status: 401 });
    expect(refreshCallCount).toBe(0);
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('갱신 성공 후 재시도가 다시 401 이어도 refresh 를 다시 시도하지 않는다(루프 방지)', async () => {
    let refreshCallCount = 0;
    let meCallCount = 0;
    server.use(
      http.get(`${BASE_URL}/users/me`, () => {
        meCallCount += 1;
        return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
      }),
      http.post(`${BASE_URL}/auth/web/refresh`, () => {
        refreshCallCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 401 });
    expect(refreshCallCount).toBe(1); // 재시도(2번째 me)의 401 은 새 갱신을 열지 않는다
    expect(meCallCount).toBe(2);      // 원요청 + 재시도 1회, 3번째 호출 없음
  });

  it('POST 재시도에서도 요청 바디가 보존된다', async () => {
    const receivedBodies: unknown[] = [];
    let postCallCount = 0;
    server.use(
      // 인증 필요한 임의의 쓰기 API — 실제 클라이언트 메서드로 호출한다(바디 왕복 검증이 목적)
      http.patch(`${BASE_URL}/users/me`, async ({ request }) => {
        postCallCount += 1;
        receivedBodies.push(await request.json());
        if (postCallCount === 1) {
          return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
      http.post(`${BASE_URL}/auth/web/refresh`, () => new HttpResponse(null, { status: 204 })),
    );

    await cookieClient().users.updateProfile({ name: '새이름', grade: 'SENIOR' });

    expect(postCallCount).toBe(2);
    expect(receivedBodies[1]).toEqual(receivedBodies[0]); // 재시도 바디 = 원본 바디
  });

  it('refresh 가 네트워크 오류(fetch 실패)면 세션을 끝내지 않는다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () => HttpResponse.error()),
    );

    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 401 });
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('동시 요청이 함께 실패해도 세션 종료 알림은 한 번만 발화한다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return HttpResponse.json(
          { ok: false, data: null, message: '만료', code: 'AUTH_SESSION_EXPIRED' }, { status: 401 });
      }),
    );

    const client = cookieClient();
    const results = await Promise.allSettled([client.users.me(), client.users.me()]);

    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1); // notify 는 single-flight 실행기에서 1회
  });
});
