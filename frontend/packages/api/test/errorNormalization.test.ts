import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { TimeoutError } from 'ky';
import {
  createApiClient,
  ApiError,
  toApiError,
  readBodyWithTimeout,
  TIMEOUT_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../src/client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

describe('toApiError 정규화', () => {
  it('ky TimeoutError → ApiError(code TIMEOUT, 한글 안내)', async () => {
    const kyTimeout = new TimeoutError(new Request('http://localhost:8080/api/v1/users/me'));
    await expect(toApiError(kyTimeout)).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'TIMEOUT',
      message: TIMEOUT_ERROR_MESSAGE,
    });
  });

  it('네트워크 실패(fetch TypeError) → ApiError(code NETWORK, 한글 안내)', async () => {
    server.use(http.get('*/users/me', () => HttpResponse.error()));
    await expect(client.users.me()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK',
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it('이미 ApiError면 그대로 재던진다', async () => {
    const original = new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK');
    await expect(toApiError(original)).rejects.toBe(original);
  });

  it('200 + null 봉투는 NETWORK 가 아니라 status 0 빈 응답 ApiError 로 거부한다', async () => {
    server.use(http.get('*/users/me', () => HttpResponse.json(null)));
    await expect(client.users.me()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: '응답이 비어 있습니다.',
    });
  });
});

describe('readBodyWithTimeout — 본문 소비 타임아웃', () => {
  it('즉시 resolve 되는 본문은 그대로 통과시킨다', async () => {
    await expect(readBodyWithTimeout(Promise.resolve({ ok: true }), 50)).resolves.toEqual({
      ok: true,
    });
  });

  it('본문이 stall 되면 timeoutMs 후 TIMEOUT ApiError 로 거부한다', async () => {
    // 영원히 pending 인 본문 + 작은 timeoutMs 로 실대기 없이 빠르게 검증한다.
    await expect(readBodyWithTimeout(new Promise(() => {}), 50)).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'TIMEOUT',
      message: TIMEOUT_ERROR_MESSAGE,
    });
  });
});
