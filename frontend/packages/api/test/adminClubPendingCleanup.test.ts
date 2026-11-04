import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';
import { ApiError } from '../src/http';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });

describe('총동연 동아리 남은 미결 정리 API 클라이언트', () => {
  it('정리는 본문 없이 동아리 경로로 POST 하고 처리 건수를 돌려준다', async () => {
    let cleanupMethod = '';
    let cleanupBody: unknown = null;
    server.use(
      http.post(`${BASE_URL}/admin/clubs/7/pending-cleanup`, async ({ request }) => {
        cleanupMethod = request.method;
        cleanupBody = await request.text();
        return HttpResponse.json({
          ok: true,
          message: null,
          data: { rejectedApplicationCount: 3, rejectedJoinRequestCount: 1 },
        });
      }),
    );

    const cleanupResult = await client().admin.clubs.cleanupPending(7);

    expect(cleanupMethod).toBe('POST');
    expect(cleanupBody).toBe('');
    expect(cleanupResult).toEqual({ rejectedApplicationCount: 3, rejectedJoinRequestCount: 1 });
  });

  it('운영 중단이 아니면 서버 문구를 담은 409 ApiError 로 끝난다', async () => {
    server.use(
      http.post(`${BASE_URL}/admin/clubs/7/pending-cleanup`, () =>
        HttpResponse.json(
          { ok: false, message: '운영 중단 동아리만 남은 미결을 정리할 수 있어요.', data: null },
          { status: 409 },
        ),
      ),
    );

    await expect(client().admin.clubs.cleanupPending(7)).rejects.toMatchObject({
      status: 409,
      message: '운영 중단 동아리만 남은 미결을 정리할 수 있어요.',
    });
    await expect(client().admin.clubs.cleanupPending(7)).rejects.toBeInstanceOf(ApiError);
  });

  it('목록은 남은 미결 조건을 운영 중단 상태와 함께 쿼리로 보낸다', async () => {
    let listSearch = '';
    server.use(
      http.get(`${BASE_URL}/admin/clubs`, ({ request }) => {
        listSearch = new URL(request.url).search;
        return HttpResponse.json({
          ok: true,
          message: null,
          data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false },
        });
      }),
    );

    await client().admin.clubs.list({ status: 'INACTIVE', needsPendingCleanup: true, page: 0, size: 20 });

    const listParams = new URLSearchParams(listSearch);
    expect(listParams.get('status')).toBe('INACTIVE');
    expect(listParams.get('needsPendingCleanup')).toBe('true');
  });
});
