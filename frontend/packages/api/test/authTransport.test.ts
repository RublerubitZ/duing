import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { setStorage } from '@duing/storage';

import { createApiClient } from '../src/client';
import { TOKEN_STORAGE_KEY } from '../src/token';
import { registerUnauthorizedHandler } from '../src/unauthorized-context';

import type { Storage } from '@duing/storage';
import type { User } from '@duing/types';

const BASE_URL = 'http://localhost:8080/api/v1';
const LOGIN_PAYLOAD = { studentId: '20251234', password: 'Test1234!@' };
const TEST_USER: User = {
  id: 1,
  studentId: '20251234',
  name: '테스트',
  phone: '010-1234-5678',
  grade: 'FRESHMAN',
  role: 'STUDENT',
};

const server = setupServer();
const store = new Map<string, string>();
let storageReadCount = 0;
let storageWriteCount = 0;

const memoryStorage: Storage = {
  getItem: async (key) => {
    storageReadCount += 1;
    return store.get(key) ?? null;
  },
  setItem: async (key, value) => {
    storageWriteCount += 1;
    store.set(key, value);
  },
  removeItem: async (key) => {
    storageWriteCount += 1;
    store.delete(key);
  },
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  registerUnauthorizedHandler(null);
});
afterAll(() => server.close());

beforeEach(() => {
  setStorage(memoryStorage);
  store.clear();
  storageReadCount = 0;
  storageWriteCount = 0;
});

describe('인증 전송 모드', () => {
  it('cookie 모드는 웹 로그인 경로를 사용하고 Authorization을 붙이지 않는다', async () => {
    store.set(TOKEN_STORAGE_KEY, 'stored-jwt');
    const client = createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });
    let authorization: string | null = 'not-called';
    server.use(
      http.post(`${BASE_URL}/auth/web/login`, ({ request }) => {
        authorization = request.headers.get('authorization');
        return HttpResponse.json({ ok: true, data: { user: TEST_USER }, message: null });
      }),
    );

    await expect(client.auth.login(LOGIN_PAYLOAD)).resolves.toEqual(TEST_USER);

    expect(authorization).toBeNull();
    expect(storageReadCount).toBe(0);
    expect(storageWriteCount).toBe(0);
  });

  it('bearer 모드는 기존 로그인 JWT를 storage에 저장하고 User를 반환한다', async () => {
    const client = createApiClient({ baseUrl: BASE_URL });
    server.use(
      http.post(`${BASE_URL}/auth/login`, () =>
        HttpResponse.json({
          ok: true,
          data: { accessToken: 'mobile-jwt', tokenType: 'Bearer', user: TEST_USER },
          message: null,
        }),
      ),
    );

    await expect(client.auth.login(LOGIN_PAYLOAD)).resolves.toEqual(TEST_USER);

    expect(await memoryStorage.getItem(TOKEN_STORAGE_KEY)).toBe('mobile-jwt');
  });

  it('bearer 기본 모드는 storage JWT를 Authorization으로 전송한다', async () => {
    store.set(TOKEN_STORAGE_KEY, 'mobile-jwt');
    const client = createApiClient({ baseUrl: BASE_URL });
    let authorization: string | null = 'not-called';
    server.use(
      http.get(`${BASE_URL}/users/me`, ({ request }) => {
        authorization = request.headers.get('authorization');
        expect(request.credentials).toBe('same-origin');
        return HttpResponse.json({ ok: true, data: TEST_USER, message: null });
      }),
    );

    await client.users.me();

    expect(authorization).toBe('Bearer mobile-jwt');
  });

  it('bearer 로그인에 저장 토큰이 실린 401은 세션만료를 알린다', async () => {
    store.set(TOKEN_STORAGE_KEY, 'stale-mobile-jwt');
    const client = createApiClient({ baseUrl: BASE_URL });
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    server.use(
      http.post(`${BASE_URL}/auth/login`, () =>
        HttpResponse.json({ ok: false, data: null, message: '로그인에 실패했습니다.' }, { status: 401 }),
      ),
    );

    await expect(client.auth.login(LOGIN_PAYLOAD)).rejects.toMatchObject({ status: 401 });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('cookie 모드 요청은 credentials include를 사용한다', async () => {
    store.set(TOKEN_STORAGE_KEY, 'stored-jwt');
    const client = createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });
    let authorization: string | null = 'not-called';
    server.use(
      http.get(`${BASE_URL}/users/me`, ({ request }) => {
        expect(request.credentials).toBe('include');
        authorization = request.headers.get('authorization');
        return HttpResponse.json({ ok: true, data: TEST_USER, message: null });
      }),
    );

    await client.users.me();

    expect(authorization).toBeNull();
    expect(storageReadCount).toBe(0);
    expect(storageWriteCount).toBe(0);
  });
});
