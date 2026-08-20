import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { FeeBill } from '@duing/types';

const mockUseClubFeeBillsQuery = vi.fn();
const mockCancelMutate = vi.fn();
const mockUseBillPaymentsQuery = vi.fn((_clubId: number, _billId: number) => ({
  data: [] as unknown[],
  isLoading: false,
}));
const mockRecordMutate = vi.fn();
const mockVoidMutate = vi.fn();
// 회원 이름·학번 해석용. buildBill 의 userId(42, 99) 와 매칭되는 회원을 돌려준다.
const members = [
  {
    memberId: 1,
    userId: 42,
    name: '김민지',
    studentId: '20210001',
    role: 'MEMBER' as const,
    joinedAt: '2026-01-01',
  },
  {
    memberId: 2,
    userId: 99,
    name: '박서준',
    studentId: '20210002',
    role: 'OFFICER' as const,
    joinedAt: '2026-01-02',
  },
];
const mockUseClubMembersQuery = vi.fn((_clubId: number) => ({ data: members, isLoading: false }));
vi.mock('@duing/hooks', () => ({
  useClubFeeBillsQuery: (clubId: number, params: unknown) =>
    mockUseClubFeeBillsQuery(clubId, params),
  useClubMembersQuery: (clubId: number) => mockUseClubMembersQuery(clubId),
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

const buildBill = (over: Partial<FeeBill> = {}): FeeBill => ({
  id: 100,
  clubId: 1,
  userId: 42,
  feePolicyId: 7,
  amount: 10000,
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  status: 'PENDING',
  paidAmount: 0,
  remainingAmount: 10000,
  ...over,
  // 표기 축 기본값은 저장 상태와 동일 — 표기/저장이 갈리는 케이스만 displayStatus 를 따로 준다.
  displayStatus: over.displayStatus ?? over.status ?? 'PENDING',
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

  it('행에 회원 이름·학번·회차·금액·마감일과 상태 뱃지를 표시한다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([buildBill()]), isLoading: false });
    render(<BillList clubId={1} />);
    // 상태 라벨은 필터 select 의 option 으로도 등장하므로, 청구 행 안의 뱃지로 한정해 단언한다.
    const row = screen.getByRole('listitem');
    // userId 42 → 김민지(20210001) 로 해석되어 `회원 #id` 대신 이름·학번이 보인다.
    expect(within(row).getByText('김민지')).toBeInTheDocument();
    expect(within(row).getByText('20210001')).toBeInTheDocument();
    expect(within(row).queryByText('회원 #42')).not.toBeInTheDocument();
    expect(within(row).getByText(/2026-07 · 10,000원 · 마감 2026-07-31/)).toBeInTheDocument();
    expect(within(row).getByText('납부대기')).toBeInTheDocument();
  });

  it('마감이 지난 미납 청구는 저장 상태가 납부대기여도 연체 배지로 보여준다', () => {
    // 연체 전이 배치가 늦으면 status 는 아직 PENDING 인 채로 서버 파생 표기만 OVERDUE 가 된다.
    mockUseClubFeeBillsQuery.mockReturnValue({
      data: buildPage([buildBill({ status: 'PENDING', displayStatus: 'OVERDUE' })]),
      isLoading: false,
    });
    render(<BillList clubId={1} />);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('연체')).toBeInTheDocument();
    expect(within(row).queryByText('납부대기')).not.toBeInTheDocument();
  });

  it('저장 상태가 연체여도 완납된 청구에는 납부완료 배지를 보여준다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({
      data: buildPage([
        buildBill({
          status: 'OVERDUE',
          displayStatus: 'PAID',
          paidAmount: 10000,
          remainingAmount: 0,
        }),
      ]),
      isLoading: false,
    });
    render(<BillList clubId={1} />);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('납부완료')).toBeInTheDocument();
    expect(within(row).queryByText('연체')).not.toBeInTheDocument();
  });

  it('취소 액션 게이트는 표기 축이 아니라 저장 상태로 판정한다', () => {
    // 파생 표기가 연체여도 저장 상태가 CANCELLED 면 취소 버튼은 이미 소진된 상태여야 한다.
    mockUseClubFeeBillsQuery.mockReturnValue({
      data: buildPage([buildBill({ status: 'CANCELLED', displayStatus: 'OVERDUE' })]),
      isLoading: false,
    });
    render(<BillList clubId={1} />);

    expect(screen.getByRole('button', { name: '취소됨' })).toBeDisabled();
    // 배지는 표기 축을 따라 연체로 보인다 — 두 축이 서로 침범하지 않는다.
    expect(within(screen.getByRole('listitem')).getByText('연체')).toBeInTheDocument();
  });

  it('회원을 못 찾으면(탈퇴 등) `회원 #id` 로 폴백한다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({
      data: buildPage([buildBill({ userId: 1818 })]),
      isLoading: false,
    });
    render(<BillList clubId={1} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('회원 #1818')).toBeInTheDocument();
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
    expect(screen.getByText('납부 내역 · 김민지')).toBeInTheDocument();
  });

  it('회원 검색에서 이름으로 찾아 선택하면 userId 필터로 재조회하고, 칩 해제 시 필터가 풀린다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([buildBill()]), isLoading: false });
    render(<BillList clubId={1} />);

    // 이름 일부를 입력하면 일치하는 회원이 드롭다운에 뜬다.
    fireEvent.change(screen.getByRole('textbox', { name: '회원 검색' }), {
      target: { value: '서준' },
    });
    const option = screen.getByRole('button', { name: '박서준 · 20210002' });
    expect(option).toBeInTheDocument();

    // 선택하면 해당 회원의 userId(99) 로 재조회되고, 칩이 나타난다.
    fireEvent.click(option);
    const afterSelect = mockUseClubFeeBillsQuery.mock.calls.at(-1);
    expect(afterSelect?.[1]).toMatchObject({ userId: 99, page: 0 });
    expect(screen.getByText('박서준 · 20210002')).toBeInTheDocument();

    // 칩의 × 를 누르면 userId 필터가 제거된다.
    fireEvent.click(screen.getByRole('button', { name: '회원 필터 해제' }));
    const afterClear = mockUseClubFeeBillsQuery.mock.calls.at(-1);
    expect(afterClear?.[1]).not.toHaveProperty('userId');
  });
});
