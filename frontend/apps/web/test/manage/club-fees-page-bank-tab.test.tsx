import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 거래 탭 게이팅(403=미사용) 검증. ClubFeesPage 가 마운트하는 전 회비 훅을 안전한 기본값으로 모킹한다.
const mockBankTransactionsQuery = vi.fn();

const emptyPage = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false };
const idleQuery = { data: undefined, isLoading: false, error: null };
const idleMutation = { mutate: vi.fn(), isPending: false, error: null };

vi.mock('@duing/hooks', () => ({
  useBankTransactionsQuery: (clubId: number, params: { status?: string }) =>
    mockBankTransactionsQuery(clubId, params),
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
    mockBankTransactionsQuery.mockReturnValue(idleQuery);
  });

  it('검토 큐 조회가 403 이면 미사용 안내 카드를 노출하고 동기화 버튼을 숨긴다', async () => {
    const user = userEvent.setup();
    mockBankTransactionsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new MockApiError(403, '권한이 없습니다.'),
    });
    render(<ClubFeesPage clubId={1} />);

    await user.click(screen.getByRole('tab', { name: '거래' }));

    expect(
      screen.getByText('이 동아리는 BANK 자동매칭을 사용하지 않습니다. (총동연 등록 필요)'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '거래내역 동기화' })).not.toBeInTheDocument();
  });

  it('403 이 아니면 동기화 버튼과 검토 큐를 노출한다', async () => {
    const user = userEvent.setup();
    render(<ClubFeesPage clubId={1} />);

    await user.click(screen.getByRole('tab', { name: '거래' }));

    expect(screen.getByRole('button', { name: '거래내역 동기화' })).toBeInTheDocument();
    expect(screen.getByText('검토할 입금 거래가 없습니다.')).toBeInTheDocument();
  });
});
