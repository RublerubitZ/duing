import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseClubFeeSummaryQuery = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeeSummaryQuery: (clubId: number, params: unknown) =>
    mockUseClubFeeSummaryQuery(clubId, params),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { FeeSummaryCards } from '@/app/manage/clubs/[clubId]/fees/_components/FeeSummaryCards';

const buildSummary = (over: Partial<Record<string, number>> = {}) => ({
  totalBilled: 100000,
  totalPaid: 50000,
  outstanding: 50000,
  collectionRate: 50,
  billCount: 3,
  pendingCount: 1,
  partialPaidCount: 1,
  overdueCount: 0,
  paidCount: 1,
  ...over,
});

describe('FeeSummaryCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('수납률·미수금·총 청구액과 상태별 건수를 표시한다', () => {
    mockUseClubFeeSummaryQuery.mockReturnValue({ data: buildSummary(), isLoading: false });
    render(<FeeSummaryCards clubId={1} />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('총 50,000원 / 100,000원')).toBeInTheDocument();
    // 미수금과 총 청구액 모두 50,000원/100,000원이 등장하므로 개수로 단언한다.
    expect(screen.getAllByText('50,000원').length).toBeGreaterThan(0);
    expect(screen.getAllByText('100,000원').length).toBeGreaterThan(0);
    expect(screen.getByText('청구 3건')).toBeInTheDocument();

    expect(screen.getByText('납부대기 1')).toBeInTheDocument();
    expect(screen.getByText('부분납부 1')).toBeInTheDocument();
    expect(screen.getByText('연체 0')).toBeInTheDocument();
    expect(screen.getByText('납부완료 1')).toBeInTheDocument();
  });

  it('collectionRate 의 소수점 표기를 재반올림하지 않고 그대로 보여준다', () => {
    mockUseClubFeeSummaryQuery.mockReturnValue({
      data: buildSummary({ collectionRate: 33.3 }),
      isLoading: false,
    });
    render(<FeeSummaryCards clubId={1} />);

    expect(screen.getByText('33.3%')).toBeInTheDocument();
  });

  it('미수금이 있으면 연체 건수와 함께 강조한다', () => {
    mockUseClubFeeSummaryQuery.mockReturnValue({
      data: buildSummary({ overdueCount: 2 }),
      isLoading: false,
    });
    render(<FeeSummaryCards clubId={1} />);

    expect(screen.getByText('연체 2')).toBeInTheDocument();
  });

  it('발행된 청구가 없으면 오해 소지 있는 수치 대신 빈 상태를 표시한다', () => {
    mockUseClubFeeSummaryQuery.mockReturnValue({
      data: buildSummary({
        billCount: 0,
        totalBilled: 0,
        totalPaid: 0,
        outstanding: 0,
        collectionRate: 0,
        pendingCount: 0,
        partialPaidCount: 0,
        overdueCount: 0,
        paidCount: 0,
      }),
      isLoading: false,
    });
    render(<FeeSummaryCards clubId={1} />);

    expect(screen.getByText('아직 발행된 청구가 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('로딩 중에는 로딩 스피너를 표시한다', () => {
    mockUseClubFeeSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<FeeSummaryCards clubId={1} />);

    expect(screen.getByRole('status', { name: '수납 현황 불러오는 중' })).toBeInTheDocument();
  });

  it('billingPeriod 미지정 시 빈 파라미터로 동아리 전체를 조회한다', () => {
    mockUseClubFeeSummaryQuery.mockReturnValue({ data: buildSummary(), isLoading: false });
    render(<FeeSummaryCards clubId={9} />);

    expect(mockUseClubFeeSummaryQuery).toHaveBeenCalledWith(9, {});
  });

  it('billingPeriod 지정 시 회차 파라미터로 조회한다', () => {
    mockUseClubFeeSummaryQuery.mockReturnValue({ data: buildSummary(), isLoading: false });
    render(<FeeSummaryCards clubId={9} billingPeriod="2026-07" />);

    expect(mockUseClubFeeSummaryQuery).toHaveBeenCalledWith(9, { billingPeriod: '2026-07' });
  });
});
