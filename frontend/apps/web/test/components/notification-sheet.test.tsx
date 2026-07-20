import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Notification } from '@duing/types';

const mockListQuery = vi.fn();
const mockReadMutate = vi.fn();
const mockReadAllMutate = vi.fn();
const mockPush = vi.fn();

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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock('@duing/hooks', async (importOriginal) => ({
  // 날짜 유틸(formatRelativeTime 등) 순수 함수는 실제 구현을 그대로 쓴다.
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useNotificationListQuery: () => mockListQuery(),
  useNotificationSourceAwareReadMutation: () => ({ mutate: mockReadMutate }),
  useNotificationReadAllMutation: () => ({ mutate: mockReadAllMutate }),
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

import { NotificationSheet } from '../../app/_components/NotificationSheet';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    source: 'PERSONAL',
    id: 1,
    type: 'RECRUITMENT_OPENED',
    title: '가입 신청 도착',
    body: '새 가입 신청을 확인하세요',
    linkUrl: '/manage/clubs/1/applicants',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function setList(content: Notification[]) {
  mockListQuery.mockReturnValue({
    data: { pages: [{ content }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  });
}

describe('NotificationSheet — 데스크탑 우측 알림 패널', () => {
  beforeEach(() => {
    mockReadMutate.mockClear();
    mockReadAllMutate.mockClear();
    mockPush.mockClear();
    setList([makeNotification()]);
  });

  it('열리면 제목·안읽음 개수·알림 항목·전체 보기 링크가 보인다', () => {
    render(<NotificationSheet open onOpenChange={vi.fn()} unreadCount={2} />);

    expect(screen.getByRole('heading', { name: '알림' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /가입 신청 도착/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '전체 알림 보기' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  it('항목 클릭 시 읽음 처리하고 대상으로 이동하며 패널을 닫는다', () => {
    const onOpenChange = vi.fn();
    render(<NotificationSheet open onOpenChange={onOpenChange} unreadCount={1} />);

    fireEvent.click(screen.getByRole('button', { name: /가입 신청 도착/ }));

    expect(mockReadMutate).toHaveBeenCalledWith({ source: 'PERSONAL', id: 1 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockPush).toHaveBeenCalledWith('/manage/clubs/1/applicants');
  });

  it('모두 읽음 버튼이 readAll 뮤테이션을 호출한다', () => {
    render(<NotificationSheet open onOpenChange={vi.fn()} unreadCount={1} />);

    fireEvent.click(screen.getByRole('button', { name: '모두 읽음' }));
    expect(mockReadAllMutate).toHaveBeenCalledTimes(1);
  });

  it('알림이 없으면 빈 상태 문구를 보여준다', () => {
    setList([]);
    render(<NotificationSheet open onOpenChange={vi.fn()} unreadCount={0} />);
    expect(screen.getByText('새 알림이 없어요')).toBeInTheDocument();
  });

  it('닫힌 상태(open=false)면 패널 내용이 렌더되지 않는다', () => {
    render(<NotificationSheet open={false} onOpenChange={vi.fn()} unreadCount={1} />);
    expect(screen.queryByRole('heading', { name: '알림' })).not.toBeInTheDocument();
    expect(screen.queryByText('전체 알림 보기')).not.toBeInTheDocument();
  });
});
