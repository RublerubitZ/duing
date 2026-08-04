import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@duing/stores';

const mockReplace = vi.fn();
const mockListQuery = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
}));
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useNotificationListQuery: (unreadOnly: boolean, enabled: boolean) =>
    mockListQuery(unreadOnly, enabled),
  useNotificationSourceAwareReadMutation: () => ({ mutate: vi.fn() }),
  useNotificationReadAllMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

// jsdom 은 IntersectionObserver 를 제공하지 않으므로 무한 스크롤 옵서버를 무력화한다.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import NotificationsPage from '@/app/notifications/page';

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  mockReplace.mockClear();
  mockListQuery.mockReset();
  mockListQuery.mockReturnValue({
    data: { pages: [{ content: [] }] },
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  });
});

describe('NotificationsPage — 렌더는 status, 이동은 확정 신호', () => {
  // 로컬 이력만 지워졌을 뿐 세션은 살아 있는 사용자를 시드만 보고 내보내면 로그인 화면에
  // 방치된다(로그인 페이지에는 되돌려 보내는 장치가 없다) — 확정 전에는 이동하지 않는다.
  // 그렇다고 대기 화면만 두면, 갱신이 401 이 아닌 이유로 실패해 확정이 영영 서지 않는 익명
  // 방문자가 무한 스피너에 갇힌다 — 로그인 진입점은 즉시 준다(fail-open).
  it('시드된 미인증(검증 전)에서는 이동하지 않고 로그인 안내를 렌더한다', () => {
    render(<NotificationsPage />);

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '로그인하기' })).toHaveAttribute(
      'href',
      '/login?next=/notifications',
    );
    expect(screen.queryByRole('heading', { name: '알림' })).not.toBeInTheDocument();
    // 미인증 판단에서 목록 조회가 켜지면 첫 렌더마다 401 이 나간다.
    expect(mockListQuery).toHaveBeenCalledWith(false, false);
  });

  it('세션 종료가 확정되면 그때 로그인으로 보낸다', () => {
    render(<NotificationsPage />);
    expect(mockReplace).not.toHaveBeenCalled();

    act(() => useAuthStore.setState({ status: 'unauthenticated', isVerified: true, user: null }));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login?next=/notifications');
  });

  it('시드된 인증이면 서버 확인 전에도 목록을 조회하고 화면을 그린다', () => {
    useAuthStore.getState().seedSession('authenticated');

    render(<NotificationsPage />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: '알림' })).toBeInTheDocument();
    expect(mockListQuery).toHaveBeenCalledWith(false, true);
  });
});
