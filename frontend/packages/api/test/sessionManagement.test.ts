import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';

import type { MySession } from '@duing/types';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SESSION_FIXTURE: MySession[] = [
  {
    sessionId: 2,
    platform: 'WEB',
    deviceLabel: 'Chrome · macOS',
    lastUsedAt: '2026-07-19T10:00:00',
    current: true,
  },
  {
    sessionId: 1,
    platform: 'IOS',
    deviceLabel: 'iPhone 15',
    lastUsedAt: '2026-07-18T22:00:00',
    current: false,
  },
];

function cookieClient() {
  return createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });
}

describe('세션 관리 API 클라이언트', () => {
  it('세션 목록을 조회한다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me/sessions`, () =>
        HttpResponse.json({ ok: true, data: SESSION_FIXTURE, message: null }),
      ),
    );

    const sessions = await cookieClient().users.sessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.current).toBe(true);
    expect(sessions[1]?.deviceLabel).toBe('iPhone 15');
  });

  it('개별 세션을 폐기한다', async () => {
    let deletedPath = '';
    server.use(
      http.delete(`${BASE_URL}/users/me/sessions/:sessionId`, ({ params }) => {
        deletedPath = String(params.sessionId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await cookieClient().users.revokeSession(1);

    expect(deletedPath).toBe('1');
  });

  it('전체 로그아웃을 호출한다', async () => {
    let called = false;
    server.use(
      http.delete(`${BASE_URL}/users/me/sessions`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await cookieClient().users.logoutAllSessions();

    expect(called).toBe(true);
  });
});
