import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('총동연 가입 링크 API 클라이언트', () => {
  it('목록은 페이지 없이 배열 그대로 돌려준다', async () => {
    server.use(
      http.get(`${BASE_URL}/admin/clubs/7/join-codes`, () =>
        HttpResponse.json({
          ok: true,
          message: null,
          data: [{ joinCodeId: 1, code: 'ABC123', status: 'REVOKED' }],
        }),
      ),
    );

    const joinCodes = await createApiClient({
      baseUrl: BASE_URL,
      authTransport: 'cookie',
    }).admin.clubJoinCodes.list(7);

    expect(joinCodes).toHaveLength(1);
    expect(joinCodes[0]?.status).toBe('REVOKED');
  });

  it('강제 폐기는 링크 경로로 사유를 PATCH 하고 204 를 그대로 흘려보낸다', async () => {
    let revokeMethod = '';
    let revokeBody: unknown = null;
    server.use(
      http.patch(`${BASE_URL}/admin/clubs/7/join-codes/42/revoke`, async ({ request }) => {
        revokeMethod = request.method;
        revokeBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' })
      .admin.clubJoinCodes.forceRevoke(7, 42, { reason: '유출 신고 접수' });

    expect(revokeMethod).toBe('PATCH');
    expect(revokeBody).toEqual({ reason: '유출 신고 접수' });
  });
});
