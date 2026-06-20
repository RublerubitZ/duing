import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '@duing/types';

import { NotificationItem } from '../../app/_components/NotificationItem';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    source: 'PERSONAL',
    id: 1,
    type: 'RECRUITMENT_OPENED',
    title: '테스트 알림 제목',
    body: '테스트 알림 본문',
    linkUrl: null,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('NotificationItem — 종류별 배지/시간', () => {
  it('마감 알림(RECRUITMENT_DEADLINE)은 "마감" 배지를 보여준다', () => {
    render(<NotificationItem notification={makeNotification({ type: 'RECRUITMENT_DEADLINE' })} onClick={vi.fn()} />);
    expect(screen.getByText('마감')).toBeInTheDocument();
  });

  it('면접 알림(INTERVIEW_SCHEDULED)은 "면접" 배지를 보여준다', () => {
    render(<NotificationItem notification={makeNotification({ type: 'INTERVIEW_SCHEDULED' })} onClick={vi.fn()} />);
    expect(screen.getByText('면접')).toBeInTheDocument();
  });

  it('공지(BROADCAST)는 type 과 무관하게 "공지" 배지를 보여준다', () => {
    render(<NotificationItem notification={makeNotification({ source: 'BROADCAST', type: null })} onClick={vi.fn()} />);
    expect(screen.getByText('공지')).toBeInTheDocument();
  });

  it('type 이 없으면 기본 "알림" 배지를 보여준다', () => {
    render(<NotificationItem notification={makeNotification({ type: null })} onClick={vi.fn()} />);
    expect(screen.getByText('알림')).toBeInTheDocument();
  });

  it('생성 2시간 전이면 "2시간 전"으로 표기한다', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(<NotificationItem notification={makeNotification({ createdAt: twoHoursAgo })} onClick={vi.fn()} />);
    expect(screen.getByText('2시간 전')).toBeInTheDocument();
  });

  it('안읽음이면 코랄 표시점이 있고, 읽음이면 없다', () => {
    const { container, rerender } = render(
      <NotificationItem notification={makeNotification({ isRead: false })} onClick={vi.fn()} />,
    );
    expect(container.querySelector('.bg-coral')).not.toBeNull();

    rerender(<NotificationItem notification={makeNotification({ isRead: true })} onClick={vi.fn()} />);
    expect(container.querySelector('.bg-coral')).toBeNull();
  });

  it('클릭하면 onClick 이 해당 알림으로 호출된다', () => {
    const onClick = vi.fn();
    const notification = makeNotification({ id: 42 });
    render(<NotificationItem notification={notification} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /테스트 알림 제목/ }));
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });
});
