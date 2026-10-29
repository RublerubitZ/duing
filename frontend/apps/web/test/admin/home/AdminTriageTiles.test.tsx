import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const mockQueue = vi.fn();
const mockCounts = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duing/hooks')>();
  return {
    daysUntilKst: actual.daysUntilKst,
    useAdminTriageQueue: () => mockQueue(),
    useAdminPendingCountsQuery: () => mockCounts(),
  } satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>;
});

import { AdminTriageTiles } from '@/app/admin/_components/home/AdminTriageTiles';
import { NOW_ISO, PENDING_COUNTS, readyArea, triageQueue } from './adminHome.data';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW_ISO));
  mockCounts.mockReturnValue({ data: PENDING_COUNTS, isError: false });
  mockQueue.mockReturnValue(triageQueue({ areas: { ...triageQueue().areas, REPORT: readyArea('2026-10-26T01:00:00Z') } }));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AdminTriageTiles', () => {
  it('7칸이 건수·보조 줄과 함께 대기 건이 먼저 보이는 목록으로 이어진다', () => {
    mockQueue.mockReturnValue(triageQueue({ areas: { ...triageQueue().areas, REPORT: readyArea('2026-10-26T01:00:00Z'), CLUB_APPROVAL: readyArea('2026-10-27T03:00:00Z') } }));
    render(<AdminTriageTiles />);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/reports?status=PENDING',
      '/admin/inquiries?status=RECEIVED',
      '/admin/facility-bookings?tab=review',
      '/admin/recruitments?status=OPEN&sort=STALE',
      '/admin/promotion-requests?status=PENDING',
      '/admin/leader-succession?status=PENDING',
      '/admin/clubs',
    ]);
    expect(links[0]).toHaveTextContent('신고 미처리2건가장 오래된 건 3일');
    expect(links[6]).toHaveTextContent('동아리 승인3건가장 오래된 건 2일');
  });

  it('신고 칸은 늘 2칸 폭이고, 건수가 있을 때만 경고색이다', () => {
    const { rerender } = render(<AdminTriageTiles />);
    const reportLink = screen.getByRole('link', { name: /신고 미처리/ });
    expect(reportLink.closest('li')).toHaveClass('col-span-2');
    expect(reportLink).toHaveClass('border-coral/40');

    mockCounts.mockReturnValue({ data: { ...PENDING_COUNTS, reportUnresolved: 0 }, isError: false });
    rerender(<AdminTriageTiles />);
    expect(screen.getByRole('link', { name: /신고 미처리/ })).not.toHaveClass('border-coral/40');
    expect(screen.getByRole('link', { name: /신고 미처리/ }).closest('li')).toHaveClass('col-span-2');
  });

  it('320px 에서도 두 칸씩 놓이고 넓으면 네 칸이다', () => {
    render(<AdminTriageTiles />);
    expect(screen.getByRole('list')).toHaveClass('grid-cols-2', 'lg:grid-cols-4', 'gap-3');
  });

  it('건수를 받기 전·받지 못했으면 칸에 건수를 그리지 않는다', () => {
    mockCounts.mockReturnValue({ data: undefined, isError: true });
    render(<AdminTriageTiles />);
    expect(screen.queryByText(/^\d+건$/)).toBeNull();
    expect(screen.getByRole('link', { name: /동아리 승인/ })).not.toHaveTextContent(/\d+건/);
  });

  it('승인 대기 시각을 모르면(옛 백엔드) 동아리 승인 칸은 신청 시각 — 로 물러선다', () => {
    mockQueue.mockReturnValue(triageQueue({ clubApprovalTimeUnknown: true }));
    render(<AdminTriageTiles />);
    expect(screen.getByRole('link', { name: /동아리 승인/ })).toHaveTextContent('동아리 승인3건신청 시각 —');
  });

  it('목록을 받지 못한 칸의 대시는 스크린 리더에 말로 읽힌다', () => {
    mockQueue.mockReturnValue(
      triageQueue({ areas: { ...triageQueue().areas, REPORT: { status: 'error', rowCount: 0, oldestWaitingSince: null } } }),
    );
    render(<AdminTriageTiles />);
    const reportLink = screen.getByRole('link', { name: /신고 미처리/ });
    expect(reportLink).toHaveTextContent('가장 오래된 건을 확인할 수 없어요');
    expect(within(reportLink).getByText('—')).toHaveAttribute('aria-hidden', 'true');
  });

  it('건수는 있는데 받은 목록이 비었을 때도 대시를 같은 문구로 읽힌다', () => {
    mockQueue.mockReturnValue(
      triageQueue({ areas: { ...triageQueue().areas, REPORT: { status: 'ready', rowCount: 0, oldestWaitingSince: null } } }),
    );
    render(<AdminTriageTiles />);
    expect(screen.getByRole('link', { name: /신고 미처리/ })).toHaveTextContent('신고 미처리2건—가장 오래된 건을 확인할 수 없어요');
  });

  it('1:1 문의는 접수가 비고 답변중만 남았으면 답변중 탭으로 연다', () => {
    mockQueue.mockReturnValue(triageQueue({ inquiryTotals: { received: 0, inProgress: 2 } }));
    render(<AdminTriageTiles />);
    expect(screen.getByRole('link', { name: /1:1 문의 미답변/ })).toHaveAttribute('href', '/admin/inquiries?status=IN_PROGRESS');
  });
});
