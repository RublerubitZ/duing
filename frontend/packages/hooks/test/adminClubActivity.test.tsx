import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useAdminClubActivityEventsQuery } from '../src/adminClubActivity';
import { adminQueryKeys } from '../src/adminQueryKeys';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

const server = setupServer(
  http.get('*/admin/clubs/7/activity-events', ({ request }) => {
    const requestedTypes = new URL(request.url).searchParams.getAll('types');
    return HttpResponse.json({
      ok: true,
      message: null,
      data: {
        content: [
          {
            eventId: 11,
            eventType: requestedTypes[0] ?? 'CLUB_CLOSED',
            actorUserId: 3,
            actorName: '총동연',
            createdAt: '2026-09-08T03:00:00Z',
            reason: '활동 중단 장기화',
            recruitmentId: null,
            joinCodeId: null,
            detail: null,
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
      },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useAdminClubActivityEventsQuery', () => {
  it('동아리 id 와 types 를 서버에 전달하고 페이지를 돌려준다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useAdminClubActivityEventsQuery(7, { types: ['CLUB_STATUS_CHANGED'], page: 0, size: 20 }),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.content[0]?.eventType).toBe('CLUB_STATUS_CHANGED');
    expect(result.current.data?.totalElements).toBe(1);
  });

  it('쿼리키는 동아리 id 와 파라미터를 포함한다', () => {
    expect(adminQueryKeys.clubActivityEvents(7, { page: 0 })).toEqual([
      'admin',
      'club-activity-events',
      7,
      { page: 0 },
    ]);
  });

  it('목록 키는 동아리 접두사 키 위에 파생되어 접두사 무효화가 목록을 함께 지운다', () => {
    const prefix = adminQueryKeys.clubActivityEventsAll(7);
    const listKey = adminQueryKeys.clubActivityEvents(7, { page: 0 });
    expect(prefix).toEqual(['admin', 'club-activity-events', 7]);
    expect(listKey.slice(0, prefix.length)).toEqual([...prefix]);
  });
});
