import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
import { NotificationItem } from '../../app/_components/NotificationItem';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    source: 'PERSONAL',
    id: 1,
    type: 'RECRUITMENT_OPENED',
    title: '테스트 알림',
    body: '알림 본문입니다.',
    linkUrl: null,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('NotificationItem — source-aware 클릭', () => {
  it('BROADCAST 알림 클릭 시 onClick 이 source=BROADCAST 인 notification 객체로 호출된다', () => {
    const onClick = vi.fn();
    const notification = makeNotification({ id: 10, source: 'BROADCAST', title: '공지 알림' });

    render(<NotificationItem notification={notification} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /공지 알림/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'BROADCAST', id: 10 }),
    );
  });

  it('PERSONAL 알림 클릭 시 onClick 이 source=PERSONAL 인 notification 객체로 호출된다', () => {
    const onClick = vi.fn();
    const notification = makeNotification({ id: 20, source: 'PERSONAL', title: '개인 알림' });

    render(<NotificationItem notification={notification} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /개인 알림/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'PERSONAL', id: 20 }),
    );
  });
});
