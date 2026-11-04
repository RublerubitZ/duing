import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('주간 브리핑 API 클라이언트', () => {
  it('weekStart 를 쿼리로 보내고 응답 data 를 그대로 돌려준다', async () => {
    let requestedWeek: string | null = null;
    server.use(
      http.get(`${BASE_URL}/admin/weekly-briefing`, ({ request }) => {
        requestedWeek = new URL(request.url).searchParams.get('weekStart');
        return HttpResponse.json({ ok: true, message: null, data: { federationNoticeCount: 3 } });
      }),
    );

    const briefing = await createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' }).admin.weeklyBriefing('2026-10-26');

    expect(requestedWeek).toBe('2026-10-26');
    expect(briefing.federationNoticeCount).toBe(3);
  });

  it('주 범위 밖 400 은 서버 code 를 ApiError.code 로 넘긴다', async () => {
    server.use(
      http.get(`${BASE_URL}/admin/weekly-briefing`, () =>
        HttpResponse.json({ ok: false, message: '아직 끝나지 않은 주입니다.', data: null, code: 'WEEK_NOT_ENDED' }, { status: 400 }),
      ),
    );

    await expect(
      createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' }).admin.weeklyBriefing('2026-11-02'),
    ).rejects.toMatchObject({ status: 400, code: 'WEEK_NOT_ENDED' });
  });
});
