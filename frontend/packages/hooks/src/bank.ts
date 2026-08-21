import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BankTransactionSearchParams, SyncBankTransactionsPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { bankQueryKeys } from './bankQueryKeys';
import { feeQueryKeys } from './feeQueryKeys';
import { retryUnlessStatuses } from './retry';

// BANK 자동매칭 미사용 동아리는 검토 큐 조회 시 403(BankMatchingNotEnabled) 으로 내려온다 —
// 정상적인 "미사용" 상태이므로 재시도하지 않고 호출부가 ApiError(status 403) 로 안내 카드를 노출한다.
// 403 은 전역 비재시도 집합(인증 실패)에도 들어 있어 지금은 인자 없이도 결과가 같지만, 여기서 막는
// 이유는 인증이 아니라 "미사용" 도메인 상태이므로 그 근거를 인자로 남긴다.
const retryUnlessForbidden = retryUnlessStatuses(403);

// 매칭/무시/해제는 검토 큐뿐 아니라 Sprint 2 청구 잔액·수납 집계에도 영향을 준다(납부 생성/무효화).
// 따라서 동기화·승인·무시·해제 후 검토 큐 + 동아리 청구 목록 + 수납 집계를 함께 무효화한다.
// onSettled(성공/실패 무관)로 무효화하는 이유: 동기화가 프론트에서 타임아웃돼도 백엔드는 이미
// 저장·자동매칭을 끝냈을 수 있다. 이때 큐를 다시 받아 와야 stale PENDING 행이 사라지고, 이미 매칭된
// 거래에 무시/승인을 시도해 409(AlreadyMatched) 가 반복되는 문제를 자가 치유한다.
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
    onSettled: () => invalidateBankAndFees(queryClient, clubId),
  });
}

// BANK 자동매칭 사용 가능 여부 조회. 거래 탭이 동기화 노출 여부를 사전에 결정하는 데 쓴다 —
// 미연동 동아리가 동기화를 눌러야만 403 으로 미사용임을 알게 되던 동작을 막는다.
export function useClubBankMatchingStatusQuery(clubId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: bankQueryKeys.matchingStatus(clubId),
    queryFn: () => client.leader.fees.bank.status(clubId),
    // 403(비운영진)은 재시도해도 결과가 바뀌지 않으므로 즉시 중단한다(검토 큐 조회와 동일 정책).
    retry: retryUnlessForbidden,
  });
}

// 검토 큐 조회(status/page/size 필터).
export function useBankTransactionsQuery(clubId: number, params: BankTransactionSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: bankQueryKeys.transactions(clubId, params),
    queryFn: () => client.leader.fees.bank.list(clubId, params),
    retry: retryUnlessForbidden,
  });
}

// 매칭 승인(입금에 후보 청구를 연결).
export function useApproveMatchMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ txId, feeBillId }: { txId: number; feeBillId: number }) =>
      client.leader.fees.bank.approve(clubId, txId, feeBillId),
    onSettled: () => invalidateBankAndFees(queryClient, clubId),
  });
}

// 거래 무시 처리.
export function useIgnoreTransactionMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (txId: number) => client.leader.fees.bank.ignore(clubId, txId),
    onSettled: () => invalidateBankAndFees(queryClient, clubId),
  });
}

// 매칭 해제(연결된 납부 무효화).
export function useUnmatchTransactionMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (txId: number) => client.leader.fees.bank.unmatch(clubId, txId),
    onSettled: () => invalidateBankAndFees(queryClient, clubId),
  });
}

// ADMIN BANK 자동매칭 관리 조회(동아리 목록 + 슬롯 현황).
export function useAdminBankMatchingQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: bankQueryKeys.adminOverview(),
    queryFn: () => client.admin.bankMatching.overview(),
  });
}

// ADMIN 동아리 자동매칭 허용/해제.
export function useSetBankMatchingMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, active }: { clubId: number; active: boolean }) =>
      client.admin.bankMatching.setActive(clubId, active),
    onSuccess: (_data, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: bankQueryKeys.adminOverview() });
      // 어드민이 자동매칭을 허용/해제하면 해당 동아리의 운영진 거래 탭 사용 가능 여부도 바뀐다.
      queryClient.invalidateQueries({ queryKey: bankQueryKeys.matchingStatus(clubId) });
    },
  });
}
