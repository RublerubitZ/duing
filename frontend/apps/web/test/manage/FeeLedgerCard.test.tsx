import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { CashbookSummary, FeeBillSummary } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a> }));

const mockFeeSummary = vi.fn();
const mockCashbookSummary = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeeSummaryQuery: (clubId: number, params: unknown) => mockFeeSummary(clubId, params),
  useCashbookSummaryQuery: (clubId: number, params: unknown) => mockCashbookSummary(clubId, params),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { FeeLedgerCard } from '@/app/manage/_components/dashboard/FeeLedgerCard';

const fee = (over: Partial<FeeBillSummary> = {}): FeeBillSummary => ({
  totalBilled: 1380000, totalPaid: 1080000, outstanding: 300000, collectionRate: 78.3, billCount: 46,
  pendingCount: 6, partialPaidCount: 0, overdueCount: 4, paidCount: 36, ...over,
});
const cashbook: CashbookSummary = { totalIncome: 0, totalExpense: 0, bookBalance: 1284500 };
const success = <T,>(data: T) => ({ data, isLoading: false, isError: false });
const failure = { data: undefined, isLoading: false, isError: true };

describe('FeeLedgerCard', () => {
  it('필터 없는 전체 기준으로 수납률·금액·연체·기한 전 미납·잔액을 그린다', () => {
    // 기한 전 미납 = 대기 + 부분 납부 — 부분 납부를 빼먹으면 5건이 된다.
    mockFeeSummary.mockReturnValue(success(fee({ pendingCount: 5, partialPaidCount: 1 })));
    mockCashbookSummary.mockReturnValue(success(cashbook));
    render(<FeeLedgerCard clubId={7} />);
    expect(mockFeeSummary).toHaveBeenCalledWith(7, {});
    expect(mockCashbookSummary).toHaveBeenCalledWith(7, {});
    expect(screen.getByText('회비 · 장부')).toBeInTheDocument();
    expect(screen.getByText('전체 청구 기준')).toBeInTheDocument();
    expect(screen.getByText('78.3%')).toBeInTheDocument();
    expect(screen.getByText('총 1,080,000원 / 1,380,000원')).toBeInTheDocument();
    expect(screen.getByText('4건')).toBeInTheDocument();
    expect(screen.getByText('기한 전 미납').nextElementSibling).toHaveTextContent('6건');
    expect(screen.getByText('300,000원')).toBeInTheDocument();
    expect(screen.getByText('1,284,500원')).toBeInTheDocument();
    expect(screen.queryByText(/원원/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '회비 관리' })).toHaveAttribute('href', '/manage/clubs/7/fees');
    // 글자 높이(약 16px)만으로는 손가락으로 누르기 어렵다 — 터치 영역 44px.
    expect(screen.getByRole('link', { name: '회비 관리' })).toHaveClass('min-h-11');
  });

  it('청구가 0건이면 안내 문구를 보이고 장부 잔액은 남긴다', () => {
    mockFeeSummary.mockReturnValue(success(fee({ billCount: 0, totalBilled: 0, totalPaid: 0, outstanding: 0, collectionRate: 0, overdueCount: 0, pendingCount: 0, paidCount: 0 })));
    mockCashbookSummary.mockReturnValue(success(cashbook));
    render(<FeeLedgerCard clubId={7} />);
    expect(screen.getByText('아직 발행된 청구가 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText('1,284,500원')).toBeInTheDocument();
  });

  it('수납률 막대 폭은 0~100 으로 제한한다', () => {
    mockFeeSummary.mockReturnValue(success(fee({ collectionRate: 130 })));
    mockCashbookSummary.mockReturnValue(success(cashbook));
    const { container } = render(<FeeLedgerCard clubId={7} />);
    expect(container.querySelector('[data-testid="fee-rate-bar"]')).toHaveStyle({ width: '100%' });
  });

  it('연체가 있을 때만 연체 건수를 경고 색으로 그린다', () => {
    mockCashbookSummary.mockReturnValue(success(cashbook));
    mockFeeSummary.mockReturnValue(success(fee({ overdueCount: 4 })));
    const { unmount } = render(<FeeLedgerCard clubId={7} />);
    expect(screen.getByText('4건')).toHaveClass('text-coral-deep');
    unmount();

    mockFeeSummary.mockReturnValue(success(fee({ overdueCount: 0 })));
    render(<FeeLedgerCard clubId={7} />);
    expect(screen.getByText('0건')).not.toHaveClass('text-coral-deep');
  });

  it('수납 요약만 실패하면 장부 잔액 + 일부 실패 안내', () => {
    mockFeeSummary.mockReturnValue(failure);
    mockCashbookSummary.mockReturnValue(success(cashbook));
    render(<FeeLedgerCard clubId={7} />);
    expect(screen.getByText('1,284,500원')).toBeInTheDocument();
    expect(screen.getByText('일부 정보를 불러오지 못했어요.')).toBeInTheDocument();
  });

  it('장부만 실패하면 수납 부분 + 일부 실패 안내', () => {
    mockFeeSummary.mockReturnValue(success(fee()));
    mockCashbookSummary.mockReturnValue(failure);
    render(<FeeLedgerCard clubId={7} />);
    expect(screen.getByText('78.3%')).toBeInTheDocument();
    expect(screen.queryByText('장부 잔액')).not.toBeInTheDocument();
    expect(screen.getByText('일부 정보를 불러오지 못했어요.')).toBeInTheDocument();
  });

  it('둘 다 실패하면 오류 안내', () => {
    mockFeeSummary.mockReturnValue(failure);
    mockCashbookSummary.mockReturnValue(failure);
    render(<FeeLedgerCard clubId={7} />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  it('둘 중 하나라도 로딩 중이면 로딩', () => {
    mockFeeSummary.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mockCashbookSummary.mockReturnValue(success(cashbook));
    render(<FeeLedgerCard clubId={7} />);
    expect(screen.queryByText('1,284,500원')).not.toBeInTheDocument();
  });
});
