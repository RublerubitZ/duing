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

  it('로그인은 5초에 타임아웃된다 (서버 6초 지연 시 5초대에 거부)', async () => {
    server.use(
      http.post('*/auth/login', async () => {
        await delay(6_000);
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const startedAt = Date.now();
    await expect(
      client.auth.login({ studentId: '20251234', password: 'Test1234!@' }),
    ).rejects.toThrow();
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(4_500);
    expect(elapsedMs).toBeLessThan(6_000);
  }, 10_000);
});
