import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 거래 탭 게이팅 검증. 미연동 동아리가 동기화를 눌러야만 미사용임을 알게 되던 동작을 막기 위해,
// BankTabPanel 은 자동매칭 사용 가능 여부(useClubBankMatchingStatusQuery)로 동기화 노출을 사전 결정한다.
// ClubFeesPage 가 마운트하는 전 회비 훅을 안전한 기본값으로 모킹한다.
const mockMatchingStatus = vi.fn();

const emptyPage = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false };
const idleQuery = { data: undefined, isLoading: false, error: null };
const idleMutation = { mutate: vi.fn(), isPending: false, error: null };

vi.mock('@duing/hooks', () => ({
  useClubBankMatchingStatusQuery: (clubId: number) => mockMatchingStatus(clubId),
  useBankTransactionsQuery: () => idleQuery,
  useClubFeeAccountQuery: () => idleQuery,
  useClubFeePoliciesQuery: () => ({ data: [], isLoading: false, error: null }),
  useClubFeeBillsQuery: () => ({ data: emptyPage, isLoading: false, error: null }),
  useClubFeeSummaryQuery: () => idleQuery,
  useClubMembersQuery: () => ({ data: [], isLoading: false, error: null }),
  useApproveMatchMutation: () => idleMutation,
  useIgnoreTransactionMutation: () => idleMutation,
  useUnmatchTransactionMutation: () => idleMutation,
  useBankSyncMutation: () => idleMutation,
  useCreateFeePolicyMutation: () => idleMutation,
  useUpdateFeePolicyMutation: () => idleMutation,
  useDeleteFeePolicyMutation: () => idleMutation,
  useGenerateBillsMutation: () => idleMutation,
  useCancelBillMutation: () => idleMutation,
  useUpsertFeeAccountMutation: () => idleMutation,
  useDeleteFeeAccountMutation: () => idleMutation,
  useRecordPaymentMutation: () => idleMutation,
  useBillPaymentsQuery: () => ({ data: [], isLoading: false, error: null }),
  useVoidPaymentMutation: () => idleMutation,
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

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

import { ClubFeesPage } from '@/app/manage/clubs/[clubId]/fees/_pages/ClubFeesPage';

describe('ClubFeesPage 거래 탭 게이팅', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMatchingStatus.mockReturnValue({ data: { enabled: true }, isLoading: false, error: null });
  });

  it('자동매칭 미사용(enabled=false) 이면 안내 카드를 노출하고 동기화 버튼을 숨긴다', async () => {
    const user = userEvent.setup();
    mockMatchingStatus.mockReturnValue({ data: { enabled: false }, isLoading: false, error: null });
    render(<ClubFeesPage clubId={1} />);

    await user.click(screen.getByRole('tab', { name: '거래' }));

    expect(
      screen.getByText('이 동아리는 BANK 자동매칭을 사용하지 않습니다. (총동연 등록 필요)'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '거래내역 동기화' })).not.toBeInTheDocument();
  });

  it('사용 가능 여부 조회가 실패하면 미사용으로 단정하지 않고 오류 안내를 노출한다', async () => {
    const user = userEvent.setup();
    mockMatchingStatus.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new MockApiError(500),
    });
    render(<ClubFeesPage clubId={1} />);

    await user.click(screen.getByRole('tab', { name: '거래' }));

    expect(
      screen.getByText('BANK 자동매칭 사용 가능 여부를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    // 일시 오류를 "미사용"으로 잘못 안내하지 않는다.
    expect(
      screen.queryByText('이 동아리는 BANK 자동매칭을 사용하지 않습니다. (총동연 등록 필요)'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '거래내역 동기화' })).not.toBeInTheDocument();
  });

  it('사용 가능 여부 확정 전(로딩) 에는 동기화 버튼을 노출하지 않는다', async () => {
    const user = userEvent.setup();
    mockMatchingStatus.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<ClubFeesPage clubId={1} />);

    await user.click(screen.getByRole('tab', { name: '거래' }));

    expect(screen.queryByRole('button', { name: '거래내역 동기화' })).not.toBeInTheDocument();
  });

  it('자동매칭 사용 가능(enabled=true) 이면 동기화 버튼과 검토 큐를 노출한다', async () => {
    const user = userEvent.setup();
    render(<ClubFeesPage clubId={1} />);

    await user.click(screen.getByRole('tab', { name: '거래' }));

    expect(screen.getByRole('button', { name: '거래내역 동기화' })).toBeInTheDocument();
    expect(screen.getByText('검토할 입금 거래가 없습니다.')).toBeInTheDocument();
  });
});
