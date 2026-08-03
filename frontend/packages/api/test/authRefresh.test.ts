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
  // 소비되지 않은 보류 통지가 다음 테스트의 등록 시점에 흘러들지 않도록 여기서 비운다
  // (보류는 핸들러가 등록되는 순간 소비된다).
  registerUnauthorizedHandler(() => {});
  registerUnauthorizedHandler(null);
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

  // 아래 두 테스트(진짜 만료 · 일시 장애)는 호출자가 받는 예외가 완전히 같다 —
  // 백엔드가 인증 401 에 code 를 붙이지 않아 status·code·message 가 구분되지 않는다.
  // 즉 "세션이 끝났는가" 의 유일한 판정 근거는 사이드 채널(unauthorizedHandler) 발화 여부다.
  // 두 단언이 같은 모양인 것은 중복이 아니라 이 계약 자체다.
  it('refresh 가 401 이면(진짜 만료) 사이드 채널로 세션 종료를 알린다 — 예외는 원 401 그대로', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료', code: 'AUTH_SESSION_EXPIRED' }, { status: 401 })),
    );

    await expect(cookieClient().users.me()).rejects.toMatchObject({
      status: 401,
      code: undefined,
      message: '인증이 필요합니다.',
    });
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
  });

  it('refresh 가 404(BE 롤백 호환 — 구 이미지엔 refresh 엔드포인트 없음)여도 세션 종료를 1회 알리고 원 401 을 표면화한다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () =>
        HttpResponse.json({ ok: false, data: null, message: 'Not Found' }, { status: 404 })),
    );

    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 401 });
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
  });

  it('refresh 가 5xx 면(일시 장애) 사이드 채널이 침묵한다 — 예외는 만료와 똑같은 원 401', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () => new HttpResponse(null, { status: 503 })),
    );

    // 위 401 테스트와 글자 그대로 같은 단언 — 반환 채널로는 두 경우를 가를 수 없다.
    await expect(cookieClient().users.me()).rejects.toMatchObject({
      status: 401,
      code: undefined,
      message: '인증이 필요합니다.',
    });
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('refresh 가 403 이면 세션을 끝내지 않는다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () =>
        HttpResponse.json({ ok: false, data: null, message: '권한 없음' }, { status: 403 })),
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

  it('갱신 성공 후 재시도된 GET 이 5xx 면 ky 기본 재시도 없이 그대로 표면화한다(호출 2회)', async () => {
    let meCallCount = 0;
    server.use(
      http.get(`${BASE_URL}/users/me`, () => {
        meCallCount += 1;
        if (meCallCount === 1) {
          return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
        }
        return new HttpResponse(null, { status: 503 });
      }),
      http.post(`${BASE_URL}/auth/web/refresh`, () => new HttpResponse(null, { status: 204 })),
    );

    // retry:0 이 없으면 bare ky 가 GET 5xx 를 2회 더 재시도해 meCallCount 가 4 가 된다.
    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 503 });
    expect(meCallCount).toBe(2); // 원요청 401 + 재시도 503, 추가 재시도 없음
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

  it('갱신 후 재시도가 원 요청의 per-request timeout 을 물려받는다', async () => {
    let meCallCount = 0;
    server.use(
      http.get(`${BASE_URL}/users/me`, async () => {
        meCallCount += 1;
        if (meCallCount === 1) {
          return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
        }
        // 재시도 응답을 지연 — timeout 이 보존(50ms)되면 초과해 TimeoutError,
        // 미보존(ky 기본 10s)이면 200ms 지연을 통과해 성공해버린다(회귀 시 이 단언 실패).
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json({
          ok: true,
          data: { id: 1, studentId: '20261234', name: '테스터', phone: '010-0000-0000', grade: 'FRESHMAN', role: 'STUDENT' },
          message: null,
        });
      }),
      http.post(`${BASE_URL}/auth/web/refresh`, () => new HttpResponse(null, { status: 204 })),
    );

    // raw(훅이 걸린 http 인스턴스)로 per-request timeout 50ms 를 실어 보낸다.
    // ky 의 TimeoutError 는 name 으로 단언한다(import 경로 이슈 회피).
    const client = cookieClient();
    await expect(client.raw.get('users/me', { timeout: 50 })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(meCallCount).toBe(2); // 원요청 401 + 재시도(보존된 50ms 로 타임아웃)
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

describe('세션 종료 사이드 채널', () => {
  function givenExpiredSession() {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
    );
  }

  // 콜드 부팅에서는 첫 요청이 핸들러 등록보다 먼저 끝날 수 있다. 그때 통지를 버리면
  // 확정된 만료가 어디에도 남지 않아, 이후 화면이 만료를 모른 채 동작한다.
  it('핸들러 등록 전에 확정된 종료도 등록 시점에 1회 전달된다', async () => {
    registerUnauthorizedHandler(null);
    givenExpiredSession();

    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 401 });

    const lateHandler = vi.fn();
    registerUnauthorizedHandler(lateHandler);
    expect(lateHandler).toHaveBeenCalledTimes(1);

    // 보류는 전달과 함께 소비된다 — 다음 등록에 같은 통지가 되풀이되지 않는다.
    const laterHandler = vi.fn();
    registerUnauthorizedHandler(laterHandler);
    expect(laterHandler).not.toHaveBeenCalled();
  });

  it('등록된 핸들러가 있으면 즉시 전달하고 보류를 남기지 않는다', async () => {
    givenExpiredSession();

    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 401 });
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);

    const nextHandler = vi.fn();
    registerUnauthorizedHandler(nextHandler);
    expect(nextHandler).not.toHaveBeenCalled();
  });

  // 호출자(부트스트랩)는 catch 시점의 스토어 상태로 종료 여부를 읽는다. 통지가 예외보다
  // 늦게 도착하면 확정된 만료가 일시 장애로 오판된다 — 순서가 계약이다.
  it('세션 종료 통지는 예외 표면화보다 먼저 도착한다', async () => {
    const events: string[] = [];
    registerUnauthorizedHandler(() => events.push('notify'));
    givenExpiredSession();

    await cookieClient()
      .users.me()
      .catch(() => events.push('reject'));

    expect(events).toEqual(['notify', 'reject']);
  });
});
