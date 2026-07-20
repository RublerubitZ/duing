import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminPendingCounts } from '@duing/types';

import { AdminSidebar } from '@/app/admin/_components/AdminSidebar';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockUsePathname = vi.fn(() => '/admin');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
const COUNTS: AdminPendingCounts = {
  clubApproval: 4,
  facilityBooking: 3,
  inquiryUnanswered: 7,
  promotionRequest: 2,
  reportUnresolved: 5,
  leaderSuccession: 0,
  totalPendingCount: 21,
};

const server = setupServer(
  http.get('*/admin/pending-counts', () =>
    HttpResponse.json({ ok: true, data: COUNTS, message: null }),
  ),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  window.localStorage.clear();
});
afterAll(() => server.close());
beforeEach(() => mockUsePathname.mockReturnValue('/admin'));

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AdminSidebar />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('AdminSidebar', () => {
  it('대시보드와 두 그룹의 메뉴가 렌더되고 현재 경로가 활성이다', async () => {
    renderSidebar();

    expect(screen.getByRole('link', { name: '대시보드' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /동아리 관리/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /회원 관리/ })).toBeInTheDocument();
    expect(screen.getByText('커뮤니티 운영')).toBeInTheDocument();
  });

  it('미처리 건수를 메뉴 뱃지로 표시하고 0건은 뱃지를 달지 않는다', async () => {
    renderSidebar();

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /동아리 관리/ })).toHaveTextContent('4'),
    );
    expect(screen.getByRole('link', { name: /1:1 문의/ })).toHaveTextContent('7');

    // 회장 승계는 0건이라 숫자가 붙지 않아야 한다.
    const successionLink = screen.getByRole('link', { name: /회장 승계/ });
    expect(successionLink).not.toHaveTextContent('0');
  });

  it('접힌 부모는 자식들의 미처리 합계를 대신 표시한다', async () => {
    renderSidebar();

    // 홍보 요청 2건 + 홍보 배너 0건 = 2
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /홍보 관리/ })).toHaveTextContent('2'),
    );
    expect(screen.getByRole('button', { name: /홍보 관리/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('부모를 펼치면 자식 메뉴가 노출되고 URL 은 기존 경로를 유지한다', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(await screen.findByRole('button', { name: /홍보 관리/ }));

    expect(screen.getByRole('link', { name: /홍보 요청/ })).toHaveAttribute(
      'href',
      '/admin/promotion-requests',
    );
    expect(screen.getByRole('link', { name: '홍보 배너' })).toHaveAttribute(
      'href',
      '/admin/promotions',
    );
  });

  it('자식 경로로 진입하면 부모가 펼쳐진 채 시작한다', async () => {
    mockUsePathname.mockReturnValue('/admin/promotion-requests');
    renderSidebar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /홍보 관리/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      ),
    );
    expect(screen.getByRole('link', { name: /홍보 요청/ })).toHaveAttribute('aria-current', 'page');
  });

  it('하위 경로는 상위 메뉴와 활성을 공유한다', async () => {
    mockUsePathname.mockReturnValue('/admin/notices/new');
    renderSidebar();

    expect(screen.getByRole('link', { name: /공지 관리/ })).toHaveAttribute('aria-current', 'page');
  });

  it('접기 상태를 저장하고 다시 열 때 복원한다', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSidebar();

    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));
    expect(window.localStorage.getItem('duing:admin:sidebar-collapsed')).toBe('1');

    unmount();
    renderSidebar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument(),
    );
  });

  it('접힌 상태에서도 메뉴 이름과 미처리 건수를 스크린리더에 전달한다', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /동아리 관리/ })).toHaveTextContent('4'),
    );
    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));

    // 라벨이 시각적으로 숨겨져도 접근성 이름과 건수는 남는다.
    expect(screen.getByRole('link', { name: /동아리 관리 4건 처리 대기/ })).toBeInTheDocument();
  });

  it('하단에 홈으로와 로그아웃 액션을 제공한다', () => {
    renderSidebar();

    expect(screen.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('접힌 상태에서 부모를 누르면 사이드바가 펼쳐지며 자식 메뉴에 도달할 수 있다', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));
    // 접힌 폭에는 하위 메뉴를 놓을 자리가 없어 자식이 렌더되지 않는다.
    expect(screen.queryByRole('link', { name: /홍보 요청/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /홍보 관리/ }));

    // 눌러도 아무 일이 없으면 이 두 메뉴는 사이드바로 영영 도달할 수 없다.
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /홍보 요청/ })).toHaveAttribute(
      'href',
      '/admin/promotion-requests',
    );
  });

  it('접힌 뱃지 항목의 접근성 이름이 메뉴명을 중복해 읽지 않는다', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /동아리 관리/ })).toHaveTextContent('4'),
    );
    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));

    const clubsLink = screen.getByRole('link', { name: /동아리 관리/ });
    expect(clubsLink).toHaveAccessibleName('동아리 관리 4건 처리 대기');
  });

  it('미처리 건수 조회가 실패해도 메뉴는 모두 렌더된다', async () => {
    server.use(
      http.get('*/admin/pending-counts', () =>
        HttpResponse.json({ ok: false, data: null, message: '오류' }, { status: 500 }),
      ),
    );
    renderSidebar();

    expect(screen.getByRole('link', { name: /동아리 관리/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /신고 관리/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /1:1 문의/ })).not.toHaveTextContent('7'),
    );
  });
});
