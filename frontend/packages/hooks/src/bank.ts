import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BankTransactionSearchParams, SyncBankTransactionsPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { bankQueryKeys } from './bankQueryKeys';
import { feeQueryKeys } from './feeQueryKeys';

// 매칭/무시/해제는 검토 큐뿐 아니라 Sprint 2 청구 잔액·수납 집계에도 영향을 준다(납부 생성/무효화).
// 따라서 동기화·승인·무시·해제 성공 시 검토 큐 + 동아리 청구 목록 + 수납 집계를 함께 무효화한다.
function invalidateBankAndFees(
  queryClient: ReturnType<typeof useQueryClient>,
  clubId: number,
): void {
  queryClient.invalidateQueries({ queryKey: bankQueryKeys.transactionsByClub(clubId) });
  queryClient.invalidateQueries({ queryKey: feeQueryKeys.billsByClub(clubId) });
  queryClient.invalidateQueries({ queryKey: feeQueryKeys.summaryByClub(clubId) });
}

// 거래 동기화. 민감 인증정보(계좌 비번·주민번호)는 페이로드로만 전달하고 캐시/로깅하지 않는다 —
// 폼 리셋은 호출부(FE-2)가 담당한다.
export function useBankSyncMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SyncBankTransactionsPayload) => client.leader.fees.bank.sync(clubId, payload),
    onSuccess: () => invalidateBankAndFees(queryClient, clubId),
  });
}

// 검토 큐 조회(status/page/size 필터).
export function useBankTransactionsQuery(clubId: number, params: BankTransactionSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: bankQueryKeys.transactions(clubId, params),
    queryFn: () => client.leader.fees.bank.list(clubId, params),
    staleTime: 30 * 1000,
  });
}

// 매칭 승인(입금에 후보 청구를 연결).
export function useApproveMatchMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ txId, feeBillId }: { txId: number; feeBillId: number }) =>
      client.leader.fees.bank.approve(clubId, txId, feeBillId),
    onSuccess: () => invalidateBankAndFees(queryClient, clubId),
  });
}

// 거래 무시 처리.
export function useIgnoreTransactionMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (txId: number) => client.leader.fees.bank.ignore(clubId, txId),
    onSuccess: () => invalidateBankAndFees(queryClient, clubId),
  });
}

// 매칭 해제(연결된 납부 무효화).
export function useUnmatchTransactionMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (txId: number) => client.leader.fees.bank.unmatch(clubId, txId),
    onSuccess: () => invalidateBankAndFees(queryClient, clubId),
  });
}

// ADMIN BANK 자동매칭 관리 조회(동아리 목록 + 슬롯 현황).
export function useAdminBankMatchingQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: bankQueryKeys.adminOverview(),
    queryFn: () => client.admin.bankMatching.overview(),
    staleTime: 30 * 1000,
  });
}

// ADMIN 동아리 자동매칭 허용/해제.
export function useSetBankMatchingMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, active }: { clubId: number; active: boolean }) =>
      client.admin.bankMatching.setActive(clubId, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankQueryKeys.adminOverview() }),
  });
}
