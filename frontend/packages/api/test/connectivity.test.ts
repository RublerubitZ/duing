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
