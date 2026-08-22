import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { FeeBill } from '@duing/types';

const mockUseClubFeeBillsQuery = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeeBillsQuery: (clubId: number, params: unknown) => mockUseClubFeeBillsQuery(clubId, params),
  useCancelBillMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useClubMembersQuery: () => ({ data: [{ userId: 42, name: '김회원', studentId: '20210001' }] }),
  useBillPaymentsQuery: () => ({ data: [], isLoading: false }),
  useRecordPaymentMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useVoidPaymentMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message = 'api error') {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  }
  return { MockApiError };
});
vi.mock('@duing/api', () => ({ ApiError: MockApiError }));
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import { BillList } from '@/app/manage/clubs/[clubId]/fees/_components/BillList';

const buildBill = (over: Partial<FeeBill> = {}): FeeBill => ({
  id: 100, clubId: 1, userId: 42, feePolicyId: 7, amount: 10000,
  billingPeriod: '2026-07', billingStartDate: '2026-07-01', billingEndDate: '2026-07-31',
  dueDate: '2026-07-31', status: 'PARTIAL_PAID', paidAmount: 4000, remainingAmount: 6000, ...over,
  // 표기 축 기본값은 저장 상태와 동일 — 표기/저장이 갈리는 케이스만 displayStatus 를 따로 준다.
  displayStatus: over.displayStatus ?? over.status ?? 'PARTIAL_PAID',
});
const buildPage = (content: unknown[]) => ({
  content, page: 0, size: 20, totalElements: content.length,
  totalPages: content.length === 0 ? 0 : 1, hasNext: false,
});

beforeEach(() => {
  mockUseClubFeeBillsQuery.mockReset();
});

describe('총무 청구 목록 — 영수증 버튼', () => {
  it('납부가 있는 청구에는 영수증 링크가 보인다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([buildBill()]), isLoading: false });
    render(<BillList clubId={1} />);
    const receiptLink = screen.getByRole('link', { name: '영수증' });
    expect(receiptLink).toHaveAttribute('href', '/manage/clubs/1/fees/100/receipt');
  });

  it('납부가 없는 청구에는 영수증 링크가 없다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({
      data: buildPage([buildBill({ status: 'PENDING', paidAmount: 0, remainingAmount: 10000 })]),
      isLoading: false,
    });
    render(<BillList clubId={1} />);
    expect(screen.queryByRole('link', { name: '영수증' })).not.toBeInTheDocument();
  });
});
