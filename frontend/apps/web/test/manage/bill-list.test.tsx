import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseClubFeeBillsQuery = vi.fn();
const mockCancelMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeeBillsQuery: (clubId: number, params: unknown) =>
    mockUseClubFeeBillsQuery(clubId, params),
  useCancelBillMutation: () => ({ mutate: mockCancelMutate, isPending: false, error: null }),
}));

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
});
