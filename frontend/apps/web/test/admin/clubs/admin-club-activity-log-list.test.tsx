import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminClubActivityEvent } from '@duing/types';

import { AdminClubActivityLogList } from '@/app/admin/clubs/[clubId]/activity-log/_components/AdminClubActivityLogList';

const EVENTS: AdminClubActivityEvent[] = [
  {
    eventId: 21,
    eventType: 'JOIN_LINK_FORCE_REVOKED',
    actorUserId: 3,
    actorName: '총동연',
    createdAt: '2026-09-09T03:00:00Z',
    reason: '유출 신고 접수',
    recruitmentId: null,
    joinCodeId: 42,
    detail: null,
  },
  {
    eventId: 20,
    eventType: 'CLUB_CLOSED',
    actorUserId: 3,
    actorName: '총동연',
    createdAt: '2026-09-08T03:00:00Z',
    reason: '활동 중단',
    recruitmentId: null,
    joinCodeId: null,
    detail: null,
  },
];

const server = setupServer(
  http.get('*/admin/clubs/1/activity-events', () =>
    HttpResponse.json({
      ok: true,
      message: null,
      data: {
        content: EVENTS,
        page: 0,
        size: 20,
        totalElements: EVENTS.length,
        totalPages: 1,
        hasNext: false,
      },
    }),
  ),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }
  return render(
    <Wrapper>
      <AdminClubActivityLogList clubId={1} />
    </Wrapper>,
  );
}

describe('동아리 활동 이력 목록 — 강제 폐기', () => {
  it('강제 폐기 행은 총동연 조치임이 드러나는 라벨과 사유를 함께 적는다', async () => {
    renderList();

    expect(await screen.findByText('부원 초대 링크 강제 폐기')).toBeInTheDocument();
    expect(screen.getByText(/사유: 유출 신고 접수/)).toBeInTheDocument();
  });

  it('가입 링크 행은 그 링크의 목록 행으로 건너뛸 수 있다', async () => {
    renderList();

    const linkToJoinCode = await screen.findByRole('link', { name: /링크 보기/ });
    expect(linkToJoinCode).toHaveAttribute('href', '/admin/clubs/1/join-codes?joinCodeId=42');
  });

  it('가입 링크와 무관한 행에는 링크 보기를 붙이지 않는다', async () => {
    renderList();

    await screen.findByText('동아리 폐쇄');
    expect(screen.getAllByRole('link', { name: /링크 보기/ })).toHaveLength(1);
  });
});
