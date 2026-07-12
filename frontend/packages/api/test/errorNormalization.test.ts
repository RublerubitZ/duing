import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { TimeoutError } from 'ky';
import {
  createApiClient,
  ApiError,
  toApiError,
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
});
