import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminClubSummary, PageResponse } from '@duing/types';

import { AdminClubsListPage } from '@/app/admin/clubs/_pages/AdminClubsListPage';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
const REJECTED_CLUB: AdminClubSummary = {
  id: 7,
  name: '거절 동아리',
  category: 'ACADEMIC',
  division: null,
  college: null,
  logoUrl: null,
  status: 'REJECTED',
  tags: [],
  leaderId: null,
  leaderName: null,
  leaderStudentId: null,
  centralClub: false,
  rejectionReason: null,
  statusChangedAt: null,
  statusChangedByName: null,
};

const CLUBS_PAGE: PageResponse<AdminClubSummary> = {
  content: [REJECTED_CLUB],
  page: 0,
  size: 20,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
};

/* ── MSW ────────────────────────────────────────────────────── */
// 목록 GET 은 status 필터 파라미터와 무관하게 REJECTED 동아리 1건을 돌려준다
// (기본 필터가 PENDING_APPROVAL 이어도 행이 렌더되도록 — 필터링은 서버 책임).
const server = setupServer(
  http.get('*/admin/clubs', () =>
    HttpResponse.json({ ok: true, data: CLUBS_PAGE, message: null }),
  ),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </ApiClientProvider>
    );
  }

  return render(
    <Wrapper>
      <AdminClubsListPage />
    </Wrapper>,
  );
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminClubsListPage — REJECTED 동아리 삭제 흐름', () => {
  it('삭제 클릭 → 다이얼로그 확인 → close API 가 사유와 함께 호출되고 다이얼로그가 닫힌다', async () => {
    let closeRequestBody: unknown = null;
    server.use(
      http.post(`*/admin/clubs/${REJECTED_CLUB.id}/close`, async ({ request }) => {
        closeRequestBody = await request.json();
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const user = userEvent.setup();
    renderPage();

    // 목록 로딩 후 REJECTED 행의 삭제 버튼 노출
    await user.click(await screen.findByRole('button', { name: '삭제' }));

    // 확인 다이얼로그에서 동아리명·사유 입력 후 확정
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('동아리명 입력 확인'), REJECTED_CLUB.name);
    await user.type(within(dialog).getByLabelText('삭제 사유 (선택)'), '운영 종료');
    await user.click(within(dialog).getByRole('button', { name: '삭제' }));

    // close API 가 캡처한 body 와 다이얼로그 닫힘 검증
    await waitFor(() => expect(closeRequestBody).toEqual({ closureReason: '운영 종료' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
