import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminFeeDashboard } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const mockFeeDashboard = vi.fn();
vi.mock('@duing/hooks', () => ({
  useAdminFeeDashboardQuery: (params: unknown) => mockFeeDashboard(params),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { AdminFeeAuditCard } from '@/app/admin/_components/home/AdminFeeAuditCard';

const FEE_DASHBOARD: AdminFeeDashboard = {
  clubCount: 62,
  feeUsingClubCount: 27,
  totalBilled: 10_000_000,
  totalPaid: 8_100_000,
  totalOutstanding: 1_900_000,
  collectionRate: 81,
  openOpinionCount: 4,
  recentActivity: { since: '2026-10-28T15:00:00Z', eventCounts: { FEE_PAYMENT_RECORDED: 7, FEE_BILL_ISSUED: 3 }, newOpinionCount: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFeeDashboard.mockReturnValue({ data: FEE_DASHBOARD, isLoading: false, isError: false });
});

describe('AdminFeeAuditCard', () => {
  it('회비 감사 화면 기본(전체 기간) 키로 할 일 신호와 현황을 보인다', () => {
    render(<AdminFeeAuditCard />);
    expect(mockFeeDashboard).toHaveBeenCalledWith({});
    expect(screen.getByText('진행중 의견').nextElementSibling).toHaveTextContent('4건');
    expect(screen.getByText('오늘 회비 활동').nextElementSibling).toHaveTextContent('12건');
    expect(screen.getByText('수납률(금액)').nextElementSibling).toHaveTextContent('81%');
    expect(screen.getByText('미납액').nextElementSibling).toHaveTextContent('1,900,000원');
    expect(screen.getByText('회비 쓰는 동아리').nextElementSibling).toHaveTextContent('27 / 62곳');
    expect(screen.getByRole('link', { name: '회비 감사' })).toHaveAttribute('href', '/admin/fees');
  });

  it('진행중 의견은 1건 이상일 때만 경고색이다', () => {
    const { rerender } = render(<AdminFeeAuditCard />);
    expect(screen.getByText('진행중 의견').nextElementSibling).toHaveClass('text-coral-deep');

    mockFeeDashboard.mockReturnValue({ data: { ...FEE_DASHBOARD, openOpinionCount: 0 }, isLoading: false, isError: false });
    rerender(<AdminFeeAuditCard />);
    expect(screen.getByText('진행중 의견').nextElementSibling).not.toHaveClass('text-coral-deep');
  });

  it('받지 못하면 빈 값 대신 오류 안내를 띄우고 회비 감사 링크는 남긴다', () => {
    mockFeeDashboard.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<AdminFeeAuditCard />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('일부 정보를 불러오지 못했어요.')).toBeNull();
    expect(screen.getByRole('link', { name: '회비 감사' })).toBeInTheDocument();
  });

  it.each([
    ['받는 중', { data: undefined, isLoading: true, isError: false }],
    // 오프라인으로 조회가 멈추면 isLoading 은 false 지만 아직 받지 못했다 — 빈 상자 대신 로딩으로 둔다.
    ['멈춘 조회', { data: undefined, isLoading: false, isError: false }],
  ])('%s면 로딩이다', (_label, state) => {
    mockFeeDashboard.mockReturnValue(state);
    render(<AdminFeeAuditCard />);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
  });

  it('값이 모두 0인 성공 응답도 본문과 링크를 그린다', () => {
    mockFeeDashboard.mockReturnValue({
      data: {
        ...FEE_DASHBOARD,
        feeUsingClubCount: 0,
        totalBilled: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        collectionRate: 0,
        openOpinionCount: 0,
        recentActivity: { since: '2026-10-28T15:00:00Z', eventCounts: {}, newOpinionCount: 0 },
      },
      isLoading: false,
      isError: false,
    });
    render(<AdminFeeAuditCard />);
    expect(screen.getByText('진행중 의견').nextElementSibling).toHaveTextContent('0건');
    expect(screen.getByText('오늘 회비 활동').nextElementSibling).toHaveTextContent('0건');
    expect(screen.getByText('미납액').nextElementSibling).toHaveTextContent('0원');
    expect(screen.getByRole('link', { name: '회비 감사' })).toBeInTheDocument();
  });
});
