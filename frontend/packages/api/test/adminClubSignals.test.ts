import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });

describe('총동연 동아리 신호 API 클라이언트', () => {
  it('목록은 신호를 운영 중 상태와 함께 쿼리로 보내고 행의 signalDetail 을 그대로 돌려준다', async () => {
    let listSearch = '';
    server.use(
      http.get(`${BASE_URL}/admin/clubs`, ({ request }) => {
        listSearch = new URL(request.url).search;
        return HttpResponse.json({
          ok: true,
          message: null,
          data: {
            content: [
              {
                id: 7, name: '두잉 코딩 동아리', category: 'ACADEMIC', division: null, college: null, logoUrl: null,
                status: 'ACTIVE', tags: [], leaderId: 3, leaderName: '김회장', leaderStudentId: '20250002',
                centralClub: false, facilitySecuredTimeTarget: false, rejectionReason: null, statusChangedAt: null,
                statusChangedByName: null, pendingSince: null, undecidedApplicationCount: null, pendingJoinRequestCount: null,
                signalDetail: {
                  operatorsLastActiveAt: '2026-10-02T03:00:00Z',
                  resultWaiting: {
                    oldestRecruitmentId: 31, oldestRecruitmentTitle: '2학기 신입 모집', oldestEndedOn: '2026-10-20',
                    recruitmentCount: 2, applicationCount: 5,
                  },
                  joinRequestWaiting: null,
                },
              },
            ],
            page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false,
          },
        });
      }),
    );

    const clubPage = await client().admin.clubs.list({ status: 'ACTIVE', signal: 'RESULT_WAITING', page: 0, size: 20 });

    const listParams = new URLSearchParams(listSearch);
    expect(listParams.get('status')).toBe('ACTIVE');
    expect(listParams.get('signal')).toBe('RESULT_WAITING');
    expect(listParams.has('needsPendingCleanup')).toBe(false);
    expect(clubPage.content[0]?.signalDetail?.resultWaiting?.applicationCount).toBe(5);
    expect(clubPage.content[0]?.signalDetail?.joinRequestWaiting).toBeNull();
  });

  it('동아리 현황은 GET /admin/club-signals 의 data 를 돌려준다', async () => {
    const clubSignals = {
      activeClubCount: 165,
      resultWaiting: { clubCount: 6, applicationCount: 15, oldestEndedOn: '2026-07-25' },
      joinRequestWaiting: { clubCount: 1, requestCount: 1, oldestRequestedAt: '2026-10-23T03:00:00Z' },
      noRecordClubCount: 110,
      operatorInactiveClubCount: 119,
    };
    server.use(
      http.get(`${BASE_URL}/admin/club-signals`, () => HttpResponse.json({ ok: true, message: null, data: clubSignals })),
    );

    await expect(client().admin.getClubSignals()).resolves.toEqual(clubSignals);
  });
});
