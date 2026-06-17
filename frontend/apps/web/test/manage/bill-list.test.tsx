import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseClubFeeBillsQuery = vi.fn();
const mockCancelMutate = vi.fn();
const mockUseBillPaymentsQuery = vi.fn((_clubId: number, _billId: number) => ({
  data: [] as unknown[],
  isLoading: false,
}));
const mockRecordMutate = vi.fn();
const mockVoidMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeeBillsQuery: (clubId: number, params: unknown) =>
    mockUseClubFeeBillsQuery(clubId, params),
  useCancelBillMutation: () => ({ mutate: mockCancelMutate, isPending: false, error: null }),
  // FE-2a: BillRow 가 여는 RecordPaymentDialog/PaymentHistory 가 쓰는 훅도 모킹해 둔다.
  useBillPaymentsQuery: (clubId: number, billId: number) =>
    mockUseBillPaymentsQuery(clubId, billId),
  useRecordPaymentMutation: () => ({ mutate: mockRecordMutate, isPending: false, error: null }),
  useVoidPaymentMutation: () => ({ mutate: mockVoidMutate, isPending: false, error: null }),
}));

// RecordPaymentDialog 가 import 하는 ApiError(분기 해소용).
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

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { BillList } from '@/app/manage/clubs/[clubId]/fees/_components/BillList';

const buildBill = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 100,
  clubId: 1,
  userId: 42,
  feePolicyId: 7,
  amount: 10000,
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  status: 'PENDING' as const,
  paidAmount: 0,
  remainingAmount: 10000,
  ...over,
});

const buildPage = (content: ReturnType<typeof buildBill>[]) => ({
  content,
  page: 0,
  size: 20,
  totalElements: content.length,
  totalPages: content.length === 0 ? 0 : 1,
  hasNext: false,
});

describe('BillList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('청구가 없으면 빈 상태 안내를 표시한다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([]), isLoading: false });
    render(<BillList clubId={1} />);
    expect(screen.getByText('발행된 청구가 없습니다.')).toBeInTheDocument();
  });

  it('행에 회원·회차·금액·마감일과 상태 뱃지를 표시한다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([buildBill()]), isLoading: false });
    render(<BillList clubId={1} />);
    // 상태 라벨은 필터 select 의 option 으로도 등장하므로, 청구 행 안의 뱃지로 한정해 단언한다.
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('회원 #42')).toBeInTheDocument();
    expect(within(row).getByText(/2026-07 · 10,000원 · 마감 2026-07-31/)).toBeInTheDocument();
    expect(within(row).getByText('납부대기')).toBeInTheDocument();
  });

  it('취소 버튼을 누르면 확인 다이얼로그에서 취소 뮤테이션을 호출한다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([buildBill()]), isLoading: false });
    mockCancelMutate.mockImplementation(
      (_billId: number, options: { onSuccess: () => void }) => options.onSuccess(),
    );
    render(<BillList clubId={1} />);

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    const confirm = screen.getByRole('alertdialog', { name: '청구 취소 확인' });
    fireEvent.click(within(confirm).getByRole('button', { name: '청구 취소' }));

    expect(mockCancelMutate).toHaveBeenCalledWith(100, expect.any(Object));
    expect(mockAddToast).toHaveBeenCalledWith('청구를 취소했습니다.');
  });

  it('CANCELLED 청구는 취소 버튼이 비활성화된다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({
      data: buildPage([buildBill({ status: 'CANCELLED' })]),
      isLoading: false,
    });
    render(<BillList clubId={1} />);
    const cancelButton = screen.getByRole('button', { name: '취소됨' });
    expect(cancelButton).toBeDisabled();
    expect(screen.getAllByText('취소됨').length).toBeGreaterThan(0);
  });

  it('상태 필터를 바꾸면 status 파라미터로 재조회한다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([buildBill()]), isLoading: false });
    render(<BillList clubId={1} />);

    fireEvent.change(screen.getByRole('combobox', { name: '청구 상태 필터' }), {
      target: { value: 'CANCELLED' },
    });

    const lastCall = mockUseClubFeeBillsQuery.mock.calls.at(-1);
    expect(lastCall?.[1]).toMatchObject({ status: 'CANCELLED', page: 0 });
  });

  it('행에 납부 진행률(납부/총액)을 표시한다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({
      data: buildPage([
        buildBill({ paidAmount: 4000, remainingAmount: 6000, status: 'PARTIAL_PAID' }),
      ]),
      isLoading: false,
    });
    render(<BillList clubId={1} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(/납부 4,000원 \/ 10,000원/)).toBeInTheDocument();
    expect(within(row).getByText(/남은 6,000원/)).toBeInTheDocument();
  });

  it('완납(remainingAmount<=0) 또는 CANCELLED 청구는 납부 기록 버튼이 비활성화된다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({
      data: buildPage([
        buildBill({ id: 1, paidAmount: 10000, remainingAmount: 0, status: 'PAID' }),
        buildBill({ id: 2, status: 'CANCELLED' }),
      ]),
      isLoading: false,
    });
    render(<BillList clubId={1} />);
    const [paidRecordButton, cancelledRecordButton] = screen.getAllByRole('button', {
      name: '납부 기록',
    });
    expect(paidRecordButton).toBeDisabled();
    expect(cancelledRecordButton).toBeDisabled();
  });

  it('납부 기록 버튼을 누르면 납부 기록 다이얼로그를 연다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([buildBill()]), isLoading: false });
    render(<BillList clubId={1} />);

    fireEvent.click(screen.getByRole('button', { name: '납부 기록' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('납부 기록')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/납부 금액/)).toBeInTheDocument();
  });

  it('내역 버튼을 누르면 납부 내역 다이얼로그를 연다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([buildBill()]), isLoading: false });
    mockUseBillPaymentsQuery.mockReturnValue({ data: [], isLoading: false });
    render(<BillList clubId={1} />);

    fireEvent.click(screen.getByRole('button', { name: '내역' }));
    expect(screen.getByText('납부 내역 · 회원 #42')).toBeInTheDocument();
  });
});
