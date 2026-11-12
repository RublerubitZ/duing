import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient, isWebLoginRequest, NETWORK_ERROR_MESSAGE } from '../src/client';
import { registerConnectivityAdapter } from '../src/connectivity';

// onUnhandledRequest: 'error' — 오프라인 fail-fast 가 뚫려 네트워크로 나가면 테스트가 즉시 실패한다.
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  registerConnectivityAdapter(null);
});
afterAll(() => server.close());

const BASE_URL = 'http://localhost:8080/api/v1';
const client = createApiClient({ baseUrl: BASE_URL });

describe('connectivity fail-fast', () => {
  it('어댑터가 false 를 반환하면 요청 없이 즉시 ApiError(NETWORK)로 거부한다', async () => {
    registerConnectivityAdapter(() => false);
    await expect(client.users.me()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK',
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it('오프라인 fail-fast 는 ky 재시도 없이 어댑터를 1회만 호출한다', async () => {
    // ky 기본 재시도(GET 계열 2회)를 retry: 0 으로 끈 뒤라야 성립한다 — 켜져 있으면 beforeRequest 가
    // 매 시도마다 재실행돼 어댑터가 3회 호출된다.
    const adapterMock = vi.fn(() => false);
    registerConnectivityAdapter(adapterMock);
    await expect(client.users.me()).rejects.toMatchObject({ name: 'ApiError', code: 'NETWORK' });
    expect(adapterMock).toHaveBeenCalledTimes(1);
  });

  it('어댑터가 true 면 요청이 정상 진행된다', async () => {
    registerConnectivityAdapter(() => true);
    server.use(
      http.get('*/users/me', () =>
        HttpResponse.json({ ok: true, data: { id: 1 }, message: null }),
      ),
    );
    await expect(client.users.me()).resolves.toMatchObject({ id: 1 });
  });

  it('어댑터는 보내려는 요청을 받는다(요청마다 판정을 달리할 수 있게)', async () => {
    const receivedRequests: string[] = [];
    registerConnectivityAdapter((request?: Request) => {
      if (request) receivedRequests.push(`${request.method} ${request.url}`);
      return true;
    });
    server.use(
      http.get('*/users/me', () =>
        HttpResponse.json({ ok: true, data: { id: 1 }, message: null }),
      ),
    );
    await client.users.me();
    expect(receivedRequests).toEqual([`GET ${BASE_URL}/users/me`]);
  });

  it('어댑터가 문자열을 돌려주면 요청 없이 그 문구로 ApiError(NETWORK)로 거부한다', async () => {
    registerConnectivityAdapter(() => '다른 탭에서 로그인 상태가 바뀌었어요.');
    await expect(client.users.me()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK',
      message: '다른 탭에서 로그인 상태가 바뀌었어요.',
    });
  });

  it('빈 문자열도 막힘이다 — 참·거짓이 아니라 타입으로 본다', async () => {
    registerConnectivityAdapter(() => '');
    await expect(client.users.me()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'NETWORK',
      message: '',
    });
  });

  it('요청 없이 부르는 가드도 문자열을 막힘으로 본다 — 401 뒤 갱신·재시도가 나가지 않는다', async () => {
    let meRequestCount = 0;
    let refreshRequestCount = 0;
    server.use(
      http.get(`${BASE_URL}/users/me`, () => {
        meRequestCount += 1;
        return HttpResponse.json(
          { ok: false, data: null, message: '인증이 필요합니다.' },
          { status: 401 },
        );
      }),
      // 갱신이 새면 성공해 재시도까지 나가게 둔다 — 핸들러가 없으면 MSW 오류가 'unavailable' 로 삼켜져 원 401 만으로는 가르지 못한다.
      http.post(`${BASE_URL}/auth/web/refresh`, () => {
        refreshRequestCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    // 보내는 요청은 통과시키고(서버에 닿은 뒤 막힌 흉내), 요청 없이 부르는 가드에만 막힘 문구를 준다.
    registerConnectivityAdapter((request?: Request) => (request === undefined ? '막힘' : true));
    const cookieClient = createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });

    await expect(cookieClient.users.me()).rejects.toMatchObject({ status: 401 });
    expect(refreshRequestCount).toBe(0);
    expect(meRequestCount).toBe(1);
  });

  it('어댑터 미등록이면 요청이 정상 진행된다', async () => {
    server.use(
      http.get('*/users/me', () =>
        HttpResponse.json({ ok: true, data: { id: 2 }, message: null }),
      ),
    );
    await expect(client.users.me()).resolves.toMatchObject({ id: 2 });
  });
});

describe('isWebLoginRequest', () => {
  it.each<[string, string, boolean]>([
    ['POST', 'auth/web/login', true],
    ['GET', 'auth/web/login', false],
    ['POST', 'auth/web/logout', false],
    ['POST', 'auth/web/refresh', false],
    ['POST', 'auth/signup', false],
    ['POST', 'auth/login', false],
    ['GET', 'users/me', false],
  ])('%s %s → %s', (method, path, expected) => {
    expect(isWebLoginRequest(new Request(`${BASE_URL}/${path}`, { method }))).toBe(expected);
  });
});
