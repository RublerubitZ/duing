import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockUseAuthStore = vi.fn();
const mockUnreadCount = vi.fn<() => { data?: { count: number } }>(() => ({ data: { count: 3 } }));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@duing/stores', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) => mockUseAuthStore(selector),
}));
vi.mock('@duing/hooks', () => ({
  useUnreadCountQuery: () => mockUnreadCount(),
  useNotificationListQuery: () => ({ data: { pages: [{ content: [] }] } }),
  useNotificationSourceAwareReadMutation: () => ({ mutate: vi.fn() }),
  useNotificationReadAllMutation: () => ({ mutate: vi.fn() }),
}));

import { NotificationBell } from '../../app/_components/NotificationBell';

function setStatus(status: string) {
  mockUseAuthStore.mockImplementation((selector: (state: { status: string }) => unknown) =>
    selector({ status }),
  );
}

describe('NotificationBell — 모바일/데스크탑 분기', () => {
  beforeEach(() => {
    mockUnreadCount.mockReturnValue({ data: { count: 3 } });
  });

  it('미인증 상태면 아무것도 렌더링하지 않는다', () => {
    setStatus('unauthenticated');
    const { container } = render(<NotificationBell />);
    expect(container.firstChild).toBeNull();
  });

  it('모바일 트리거는 전체 알림 페이지(/notifications)로 가는 링크이고 md:hidden 이다', () => {
    setStatus('authenticated');
    render(<NotificationBell />);

    const mobileTrigger = screen.getByRole('link', { name: /알림 3개/ });
    expect(mobileTrigger).toHaveAttribute('href', '/notifications');
    expect(mobileTrigger).toHaveClass('md:hidden');
  });

  it('데스크탑 트리거는 버튼이며(hidden md:inline-flex) 클릭 시 미리보기 드롭다운이 열린다', () => {
    setStatus('authenticated');
    render(<NotificationBell />);

    const desktopTrigger = screen.getByRole('button', { name: /알림 3개/ });
    expect(desktopTrigger).toHaveClass('hidden');
    expect(desktopTrigger).toHaveClass('md:inline-flex');
    // 클릭 전에는 미리보기 패널이 없다.
    expect(screen.queryByRole('heading', { name: '알림' })).not.toBeInTheDocument();

    fireEvent.click(desktopTrigger);
    expect(screen.getByRole('heading', { name: '알림' })).toBeInTheDocument();
  });

  it('읽지 않은 개수 뱃지가 모바일·데스크탑 트리거 양쪽에 표시된다', () => {
    setStatus('authenticated');
    render(<NotificationBell />);
    expect(screen.getAllByText('3')).toHaveLength(2);
  });
});
