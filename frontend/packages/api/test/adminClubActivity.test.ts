import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('관리자 동아리 활동 이력 API 클라이언트', () => {
  it('types 배열을 같은 키 반복으로 직렬화해 activity-events 를 GET 한다', async () => {
    // URL 객체를 담으면 콜백 밖에서 타입이 null 로 좁혀져 문자열로 받아 두고 단언 직전에 파싱한다.
    let hitRawUrl = '';
    server.use(
      http.get(`${BASE_URL}/admin/clubs/:clubId/activity-events`, ({ request }) => {
        hitRawUrl = request.url;
        return HttpResponse.json({
          ok: true,
          message: null,
          data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false },
        });
      }),
    );

    await createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' }).admin.clubActivity.events(7, {
      types: ['CLUB_STATUS_CHANGED', 'CLUB_CLOSED'],
      page: 1,
      size: 20,
    });

    expect(hitRawUrl).not.toBe('');
    const hitUrl = new URL(hitRawUrl);
    expect(hitUrl.pathname).toBe('/api/v1/admin/clubs/7/activity-events');
    expect(hitUrl.searchParams.getAll('types')).toEqual(['CLUB_STATUS_CHANGED', 'CLUB_CLOSED']);
    expect(hitUrl.searchParams.get('page')).toBe('1');
  });
});
