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

  it('만료된 토큰으로 로그아웃해 401 이 와도 세션만료 핸들러(notifyUnauthorized)를 트리거하지 않는다', async () => {
    // 로그아웃은 의도적 행위이고, 이미 만료/무효화된 토큰으로도 폐기를 시도하므로 401 이 정상이다.
    // 이 401 이 전역 "세션이 만료되었어요" 에러 토스트+리다이렉트를 깨우면 안 된다.
    store.set(TOKEN_STORAGE_KEY, 'stale-token');
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    server.use(
      http.post('*/auth/logout', () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    );

    await expect(client.auth.logout()).rejects.toBeDefined();

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
