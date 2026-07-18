import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { setStorage, type Storage } from '@duing/storage';
import { createApiClient } from '../src/client';
import { TOKEN_STORAGE_KEY } from '../src/token';
import { registerUnauthorizedHandler } from '../src/unauthorized-context';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  registerUnauthorizedHandler(null);
});
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

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

beforeEach(() => {
  setStorage(memoryStorage);
  store.clear();
});

describe('auth.logout', () => {
  it('POST /auth/logout 으로 서버 세션(token_version)을 폐기한다', async () => {
    let capturedUrl: string | null = null;
    let capturedMethod: string | null = null;
    server.use(
      http.post('*/auth/logout', ({ request }) => {
        capturedUrl = request.url;
        capturedMethod = request.method;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    await client.auth.logout();

    expect(capturedUrl).toContain('auth/logout');
    expect(capturedMethod).toBe('POST');
  });

  it('bearer 모드는 서버 폐기가 실패해도 로컬 토큰을 삭제하고 resolve한다', async () => {
    // 로그아웃은 의도적 행위이고, 이미 만료/무효화된 토큰으로도 폐기를 시도하므로 401 이 정상이다.
    // 이 401 이 전역 "세션이 만료되었어요" 에러 토스트+리다이렉트를 깨우면 안 된다.
    store.set(TOKEN_STORAGE_KEY, 'stale-token');
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    server.use(http.post('*/auth/logout', () => HttpResponse.json(null, { status: 500 })));

    await expect(client.auth.logout()).resolves.toBeUndefined();

    expect(await memoryStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('cookie 모드는 웹 로그아웃 500을 reject한다', async () => {
    store.set(TOKEN_STORAGE_KEY, 'mobile-token-must-remain');
    const cookieClient = createApiClient({
      baseUrl: 'http://localhost:8080/api/v1',
      authTransport: 'cookie',
    });
    server.use(http.post('*/auth/web/logout', () => HttpResponse.json(null, { status: 500 })));

    await expect(cookieClient.auth.logout()).rejects.toMatchObject({ status: 500 });
    expect(await memoryStorage.getItem(TOKEN_STORAGE_KEY)).toBe('mobile-token-must-remain');
  });

  it('cookie 로그아웃 401은 세션만료 핸들러를 트리거하지 않는다', async () => {
    const cookieClient = createApiClient({
      baseUrl: 'http://localhost:8080/api/v1',
      authTransport: 'cookie',
    });
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    server.use(
      http.post('*/auth/web/logout', () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    );

    await expect(cookieClient.auth.logout()).rejects.toBeDefined();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('cookie 모드의 인증 요청 401은 Authorization 없이도 세션만료를 알린다', async () => {
    const cookieClient = createApiClient({
      baseUrl: 'http://localhost:8080/api/v1',
      authTransport: 'cookie',
    });
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    server.use(
      http.get('*/users/me', () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    );

    await expect(cookieClient.users.me()).rejects.toBeDefined();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('cookie 로그인 401은 세션만료 핸들러를 트리거하지 않는다', async () => {
    const cookieClient = createApiClient({
      baseUrl: 'http://localhost:8080/api/v1',
      authTransport: 'cookie',
    });
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    server.use(
      http.post('*/auth/web/login', () =>
        HttpResponse.json({ ok: false, data: null, message: '로그인에 실패했습니다.' }, { status: 401 }),
      ),
    );

    await expect(
      cookieClient.auth.login({ studentId: '20251234', password: 'wrong-password' }),
    ).rejects.toBeDefined();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('로그아웃이 아닌 인증요청의 401 은 세션만료 핸들러를 트리거한다 (억제는 logout 한정)', async () => {
    store.set(TOKEN_STORAGE_KEY, 'stale-token');
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    server.use(
      http.get('*/users/me', () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    );

    await expect(client.users.me()).rejects.toBeDefined();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
