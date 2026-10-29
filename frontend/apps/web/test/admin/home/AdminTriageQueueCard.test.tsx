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
vi.mock('@duing/hooks', () => ({
  useAdminTriageQueue: () => mockQueue(),
  useAdminPendingCountsQuery: () => mockCounts(),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { AdminTriageQueueCard } from '@/app/admin/_components/home/AdminTriageQueueCard';
import { CLUB_ITEM, NOW_ISO, PENDING_COUNTS, PROMOTION_ITEM, REPORT_ITEM, readyArea, triageQueue } from './adminHome.data';

const NO_CLUB_APPROVAL = { ...PENDING_COUNTS, clubApproval: 0 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW_ISO));
  mockCounts.mockReturnValue({ data: PENDING_COUNTS, isError: false });
  mockQueue.mockReturnValue(triageQueue({ items: [REPORT_ITEM, PROMOTION_ITEM] }));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AdminTriageQueueCard', () => {
  it('오래 기다린 순 행마다 링크 하나로 처리 화면에 가고, 요약 줄에 표시 건수·전체 건수를 쓴다', () => {
    render(<AdminTriageQueueCard />);
    expect(screen.getByRole('heading', { name: '처리 대기열' })).toBeInTheDocument();
    expect(screen.getByText('오래 기다린 2건 · 전체 28건')).toBeInTheDocument();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getAllByRole('link')).toHaveLength(1);
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute('href', '/admin/reports/1');
    expect(within(rows[0]!).getByText('신고')).toHaveClass('text-coral-deep');
    expect(within(rows[1]!).getByText('홍보 요청')).not.toHaveClass('text-coral-deep');
    expect(rows[0]).toHaveTextContent('9일');
    expect(rows[0]).toHaveTextContent('신고 검토');
    expect(within(rows[1]!).getByRole('link')).toHaveAttribute('href', '/admin/promotion-requests/5');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('동아리 승인을 대기열 행으로 못 넣었으면 건수만 아는 맨 아래 한 줄로, 승인 대기가 있을 때만 둔다', () => {
    const { rerender } = render(<AdminTriageQueueCard />);
    const rows = screen.getAllByRole('listitem');
    expect(rows.at(-1)).toHaveTextContent('승인 대기 3건');
    expect(rows.at(-1)).toHaveTextContent('신청 시각을 알 수 없어요');
    expect(within(rows.at(-1)!).getByRole('link')).toHaveAttribute('href', '/admin/clubs');

    mockCounts.mockReturnValue({ data: NO_CLUB_APPROVAL, isError: false });
    rerender(<AdminTriageQueueCard />);
    expect(screen.queryByText(/승인 대기/)).toBeNull();
  });

  it('승인 대기 동아리는 시각 순 행으로 들어가고, 그러면 건수만 아는 맨 아래 줄은 없다', () => {
    mockQueue.mockReturnValue(
      triageQueue({ items: [CLUB_ITEM, REPORT_ITEM], areas: { ...triageQueue().areas, CLUB_APPROVAL: readyArea(CLUB_ITEM.waitingSince) } }),
    );
    render(<AdminTriageQueueCard />);
    const clubRow = screen.getAllByRole('listitem')[0]!;
    expect(within(clubRow).getByText('동아리 승인')).toBeInTheDocument();
    expect(clubRow).toHaveTextContent('새 동아리');
    expect(clubRow).toHaveTextContent('승인 대기');
    expect(within(clubRow).getByRole('link')).toHaveAttribute('href', '/admin/clubs');
    expect(screen.queryByText('신청 시각을 알 수 없어요')).toBeNull();
  });

  it('승인 대기 목록을 받지 못하면 건수만 아는 맨 아래 줄로 승인 대기를 남기고 일부 실패를 알린다', () => {
    mockQueue.mockReturnValue(
      triageQueue({ items: [REPORT_ITEM], isError: true, areas: { ...triageQueue().areas, CLUB_APPROVAL: { status: 'error', rowCount: 0, oldestWaitingSince: null } } }),
    );
    render(<AdminTriageQueueCard />);
    expect(screen.getByText('승인 대기 3건')).toBeInTheDocument();
    expect(screen.getByText('일부 정보를 불러오지 못했어요.')).toBeInTheDocument();
  });

  it('대기열 행이 없어도 건수만 아는 승인 대기 줄이 있으면 빈 안내를 띄우지 않는다', () => {
    mockQueue.mockReturnValue(triageQueue());
    render(<AdminTriageQueueCard />);
    expect(screen.getByText('승인 대기 3건')).toBeInTheDocument();
    expect(screen.queryByText('처리할 대기 건이 없어요')).toBeNull();
  });

  it('대기 건이 없으면 빈 안내를 띄운다', () => {
    mockCounts.mockReturnValue({ data: NO_CLUB_APPROVAL, isError: false });
    mockQueue.mockReturnValue(triageQueue());
    render(<AdminTriageQueueCard />);
    expect(screen.getByText('처리할 대기 건이 없어요')).toBeInTheDocument();
  });

  it('목록을 받는 중이면 로딩이다', () => {
    mockQueue.mockReturnValue(triageQueue({ isLoading: true }));
    render(<AdminTriageQueueCard />);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
  });

  it('목록이 먼저 0행으로 끝나도 건수(동아리 승인 줄)를 받기 전에는 "없어요"를 띄우지 않는다', () => {
    mockCounts.mockReturnValue({ data: undefined, isError: false });
    mockQueue.mockReturnValue(triageQueue());
    render(<AdminTriageQueueCard />);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByText('처리할 대기 건이 없어요')).toBeNull();
  });

  it('일부 영역이 실패하면 받은 행은 두고 일부 실패를 알린다', () => {
    mockQueue.mockReturnValue(triageQueue({ items: [REPORT_ITEM], isError: true }));
    render(<AdminTriageQueueCard />);
    expect(screen.getByRole('link', { name: /신고 검토/ })).toBeInTheDocument();
    expect(screen.getByText('일부 정보를 불러오지 못했어요.')).toBeInTheDocument();
  });

  it('건수를 받지 못하면 요약에서 전체 건수를 빼고 일부 실패를 알린다', () => {
    mockCounts.mockReturnValue({ data: undefined, isError: true });
    render(<AdminTriageQueueCard />);
    expect(screen.getByText('오래 기다린 2건')).toBeInTheDocument();
    expect(screen.getByText('일부 정보를 불러오지 못했어요.')).toBeInTheDocument();
  });

  it('모두 실패해 비었으면 빈 안내 대신 오류 안내를 띄운다', () => {
    mockCounts.mockReturnValue({ data: undefined, isError: true });
    mockQueue.mockReturnValue(triageQueue({ isError: true }));
    render(<AdminTriageQueueCard />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('처리할 대기 건이 없어요')).toBeNull();
  });

  it('긴 대상 이름·칩·처리 문구가 좁은 폭에서 줄을 바꾼다', () => {
    render(<AdminTriageQueueCard />);
    const reportRow = screen.getAllByRole('listitem')[0]!;
    expect(within(reportRow).getByText(/아주 긴 이름의 중앙동아리/)).toHaveClass('min-w-0', 'break-words', 'break-keep');
    const chip = within(reportRow).getByText('9일');
    expect(chip).toHaveClass('max-w-full', 'break-keep');
    expect(chip.parentElement).toHaveClass('ml-auto', 'flex', 'flex-wrap', 'justify-end');
    expect(chip.parentElement).not.toHaveClass('shrink-0');
  });
});
