import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function cookieClient() {
  return createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });
}

describe('관리자 회원 API 클라이언트', () => {
  it('강제 로그아웃은 대상 userId 로 force-logout 을 POST 한다', async () => {
    let hitPath = '';
    let hitMethod = '';
    server.use(
      http.post(`${BASE_URL}/admin/users/:userId/force-logout`, ({ params, request }) => {
        hitPath = String(params.userId);
        hitMethod = request.method;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    await cookieClient().admin.users.forceLogout(42);

    expect(hitMethod).toBe('POST');
    expect(hitPath).toBe('42');
  });
});
