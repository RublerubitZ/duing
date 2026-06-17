import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseBillPaymentsQuery = vi.fn();
const mockVoidMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useBillPaymentsQuery: (clubId: number, billId: number) =>
    mockUseBillPaymentsQuery(clubId, billId),
  useVoidPaymentMutation: (clubId: number, billId: number) => {
    void clubId;
    void billId;
    return { mutate: mockVoidMutate, isPending: false, error: null };
  },
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { PaymentHistory } from '@/app/manage/clubs/[clubId]/fees/_components/PaymentHistory';

const bill = {
  id: 100,
  clubId: 1,
  userId: 42,
  feePolicyId: 7,
  amount: 10000,
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  status: 'PARTIAL_PAID' as const,
  paidAmount: 6000,
  remainingAmount: 4000,
};

const activePayment = {
  id: 1,
  amount: 6000,
  method: 'CASH' as const,
  paidAt: '2026-07-10T09:00:00Z',
  memo: null,
  status: 'ACTIVE' as const,
  voidReason: null,
};

const voidedPayment = {
  id: 2,
  amount: 3000,
  method: 'TRANSFER' as const,
  paidAt: '2026-07-05T12:00:00Z',
  memo: null,
  status: 'VOIDED' as const,
  voidReason: '중복 기록',
};

describe('PaymentHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('납부가 없으면 빈 상태 안내를 표시한다', () => {
    mockUseBillPaymentsQuery.mockReturnValue({ data: [], isLoading: false });
    render(<PaymentHistory clubId={1} bill={bill} onClose={() => {}} />);
    expect(screen.getByText('기록된 납부가 없습니다.')).toBeInTheDocument();
  });

  it('ACTIVE 행은 취소 버튼, VOIDED 행은 취소됨 뱃지·사유를 표시한다', () => {
    mockUseBillPaymentsQuery.mockReturnValue({
      data: [activePayment, voidedPayment],
      isLoading: false,
    });
    render(<PaymentHistory clubId={1} bill={bill} onClose={() => {}} />);

    const [activeRow, voidedRow] = screen.getAllByRole('listitem');
    if (!activeRow || !voidedRow) {
      throw new Error('두 개의 납부 행이 렌더링되어야 합니다.');
    }

    expect(within(activeRow).getByText('6,000원')).toBeInTheDocument();
    expect(within(activeRow).getByText(/현금 · 납부일 2026-07-10/)).toBeInTheDocument();
    expect(within(activeRow).getByRole('button', { name: '취소' })).toBeInTheDocument();

    expect(within(voidedRow).getByText('취소됨')).toBeInTheDocument();
    expect(within(voidedRow).getByText(/사유: 중복 기록/)).toBeInTheDocument();
    expect(within(voidedRow).queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('취소 → 확인하면 paymentId 로 무효화 뮤테이션을 호출한다', () => {
    mockUseBillPaymentsQuery.mockReturnValue({ data: [activePayment], isLoading: false });
    mockVoidMutate.mockImplementation(
      (_vars: unknown, options: { onSuccess: () => void }) => options.onSuccess(),
    );
    render(<PaymentHistory clubId={1} bill={bill} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    const confirm = screen.getByRole('alertdialog', { name: '납부 기록 취소 확인' });
    fireEvent.click(within(confirm).getByRole('button', { name: '기록 취소' }));

    expect(mockVoidMutate).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 1 }),
      expect.any(Object),
    );
    expect(mockAddToast).toHaveBeenCalledWith('납부 기록을 취소했습니다.');
  });
});
