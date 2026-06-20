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
vi.mock('@duing/stores', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) => mockUseAuthStore(selector),
}));
vi.mock('@duing/hooks', () => ({
  useUnreadCountQuery: () => mockUnreadCount(),
}));
// 트리거 로직만 검증하기 위해 패널 본체는 가벼운 더미로 대체한다(별도 테스트에서 실물 검증).
vi.mock('../../app/_components/NotificationSheet', () => ({
  NotificationSheet: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="알림 패널" /> : null,
}));

import { NotificationBell } from '../../app/_components/NotificationBell';

function setStatus(status: string) {
  mockUseAuthStore.mockImplementation((selector: (state: { status: string }) => unknown) =>
    selector({ status }),
  );
}

describe('NotificationBell — 태블릿·모바일/데스크탑 분기', () => {
  beforeEach(() => {
    mockUnreadCount.mockReturnValue({ data: { count: 3 } });
  });

  it('미인증 상태면 아무것도 렌더링하지 않는다', () => {
    setStatus('unauthenticated');
    const { container } = render(<NotificationBell />);
    expect(container.firstChild).toBeNull();
  });

  it('lg 미만 트리거는 전체 알림 페이지(/notifications)로 가는 링크이고 lg:hidden 이다', () => {
    setStatus('authenticated');
    render(<NotificationBell />);

    const compactTrigger = screen.getByRole('link', { name: /알림 3개/ });
    expect(compactTrigger).toHaveAttribute('href', '/notifications');
    expect(compactTrigger).toHaveClass('lg:hidden');
  });

  it('lg 이상 트리거는 버튼이며(hidden lg:inline-flex) 클릭 시 우측 알림 패널이 열린다', () => {
    setStatus('authenticated');
    render(<NotificationBell />);

    const desktopTrigger = screen.getByRole('button', { name: /알림 3개/ });
    expect(desktopTrigger).toHaveClass('hidden');
    expect(desktopTrigger).toHaveClass('lg:inline-flex');
    expect(desktopTrigger).toHaveAttribute('aria-expanded', 'false');
    // 클릭 전에는 패널이 없다.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(desktopTrigger);
    expect(screen.getByRole('dialog', { name: '알림 패널' })).toBeInTheDocument();
  });

  it('읽지 않은 개수 뱃지가 양쪽 트리거에 표시된다', () => {
    setStatus('authenticated');
    render(<NotificationBell />);
    expect(screen.getAllByText('3')).toHaveLength(2);
  });
});
