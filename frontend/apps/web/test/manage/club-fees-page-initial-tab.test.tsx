import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const emptyPage = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false };
const idleQuery = { data: undefined, isLoading: false, error: null };
const idleMutation = { mutate: vi.fn(), isPending: false, error: null };
const mockBillsQuery = vi.fn((_clubId: number, _params: unknown) => ({ data: emptyPage, isLoading: false, error: null }));

vi.mock('@duing/hooks', () => ({
  useClubBankMatchingStatusQuery: () => ({ data: { enabled: false }, isLoading: false, error: null }),
  useBankTransactionsQuery: () => idleQuery,
  useClubFeeAccountQuery: () => idleQuery,
  useClubFeePoliciesQuery: () => ({ data: [], isLoading: false, error: null }),
  useClubFeeBillsQuery: (clubId: number, params: unknown) => mockBillsQuery(clubId, params),
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
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

vi.mock('@/app/_components/toast/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import { ClubFeesPage } from '@/app/manage/clubs/[clubId]/fees/_pages/ClubFeesPage';

describe('ClubFeesPage 처음 탭', () => {
  it('initialTab 이 없으면 정책 탭이 선택된다(기존과 같음)', () => {
    render(<ClubFeesPage clubId={1} />);
    expect(screen.getByRole('tab', { name: '정책' })).toHaveAttribute('aria-selected', 'true');
  });

  it('initialTab=bank 면 거래 탭으로 연다', () => {
    render(<ClubFeesPage clubId={1} initialTab="bank" />);
    expect(screen.getByRole('tab', { name: '거래' })).toHaveAttribute('aria-selected', 'true');
  });

  it('initialTab=bill + initialBillStatus=OVERDUE 면 청구 탭을 연체 필터로 연다', () => {
    render(<ClubFeesPage clubId={1} initialTab="bill" initialBillStatus="OVERDUE" />);
    expect(screen.getByRole('tab', { name: '청구' })).toHaveAttribute('aria-selected', 'true');
    expect(mockBillsQuery).toHaveBeenLastCalledWith(1, expect.objectContaining({ status: 'OVERDUE' }));
    expect(screen.getByRole('combobox', { name: '청구 상태 필터' })).toHaveValue('OVERDUE');
  });
});
