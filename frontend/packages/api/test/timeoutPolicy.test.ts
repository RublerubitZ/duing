import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';
import { REQUEST_TIMEOUT_MS } from '../src/client';
import { createApiClient } from '../src/client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

describe('REQUEST_TIMEOUT_MS 정책', () => {
  it('스펙 §3.1의 분류별 타임아웃 값을 유지한다', () => {
    expect(REQUEST_TIMEOUT_MS).toEqual({
      default: 10_000,
      login: 5_000,
      authFlow: 8_000,
      search: 8_000,
      upload: 60_000,
      logoutRevoke: 5_000,
      bankSync: 30_000,
    });
  });

  it('로그인은 5초에 TIMEOUT ApiError 로 거부한다 (서버 무응답 시)', async () => {
    server.use(
      http.post('*/auth/login', async () => {
        // 'infinite' — 응답을 영원히 보류해 판별이 시간창(6초 지연)에 의존하지 않게 한다.
        // 오류 종류(code TIMEOUT)를 단언하므로 과부하 CI 에서도 flaky 하지 않다.
        await delay('infinite');
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const startedAt = Date.now();
    await expect(
      client.auth.login({ studentId: '20251234', password: 'Test1234!@' }),
    ).rejects.toMatchObject({ name: 'ApiError', code: 'TIMEOUT' });
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(4_500);
  }, 10_000);

  it('cookie 모드 웹 로그인도 5초에 TIMEOUT ApiError 로 거부한다', async () => {
    const cookieClient = createApiClient({
      baseUrl: 'http://localhost:8080/api/v1',
      authTransport: 'cookie',
    });
    server.use(
      http.post('*/auth/web/login', async () => {
        await delay('infinite');
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    await expect(
      cookieClient.auth.login({ studentId: '20251234', password: 'Test1234!@' }),
    ).rejects.toMatchObject({ name: 'ApiError', code: 'TIMEOUT' });
  }, 10_000);
});
