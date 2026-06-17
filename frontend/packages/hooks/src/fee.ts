import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type {
  BillSearchParams,
  CreateFeePolicyPayload,
  FeeAccountPayload,
  GenerateBillsPayload,
  MyFeeSearchParams,
  UpdateFeePolicyPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { feeQueryKeys } from './feeQueryKeys';

// 계좌 미등록은 404(FeeAccountNotFoundException) 로 내려온다 — 정상적인 "빈 상태"이므로 재시도하지 않고
// 호출부가 ApiError(status 404) 로 등록 폼을 노출한다. 그 외 오류는 기본 횟수만큼 재시도한다.
function retryUnlessNotFound(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status === 404) {
    return false;
  }
  return failureCount < 2;
}

export function useClubFeePoliciesQuery(clubId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: feeQueryKeys.policies(clubId),
    queryFn: () => client.leader.fees.listPolicies(clubId),
    staleTime: 30 * 1000,
  });
}

export function useCreateFeePolicyMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFeePolicyPayload) => client.leader.fees.createPolicy(clubId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feeQueryKeys.policies(clubId) }),
  });
}

export function useUpdateFeePolicyMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, payload }: { policyId: number; payload: UpdateFeePolicyPayload }) =>
      client.leader.fees.updatePolicy(clubId, policyId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feeQueryKeys.policies(clubId) }),
  });
}

export function useDeleteFeePolicyMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (policyId: number) => client.leader.fees.deletePolicy(clubId, policyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feeQueryKeys.policies(clubId) }),
  });
}

export function useClubFeeBillsQuery(clubId: number, params: BillSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: feeQueryKeys.bills(clubId, params),
    queryFn: () => client.leader.fees.listBills(clubId, params),
    staleTime: 30 * 1000,
  });
}

export function useGenerateBillsMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, payload }: { policyId: number; payload: GenerateBillsPayload }) =>
      client.leader.fees.generateBills(clubId, policyId, payload),
    // 동시 발행으로 created=0 이어도 청구가 존재할 수 있으므로 동아리 청구 목록 전체를 무효화한다(§9).
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: feeQueryKeys.billsByClub(clubId) }),
  });
}

export function useCancelBillMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (billId: number) => client.leader.fees.cancelBill(clubId, billId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: feeQueryKeys.billsByClub(clubId) }),
  });
}

export function useMyFeesQuery(params: MyFeeSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: feeQueryKeys.myFees(params),
    queryFn: () => client.my.fees(params),
    staleTime: 30 * 1000,
  });
}

// 운영진 회비 계좌 조회(편집용). 미등록 시 ApiError(status 404) 를 surface 한다 — 호출부가 등록 폼을 노출한다.
export function useClubFeeAccountQuery(clubId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: feeQueryKeys.account(clubId),
    queryFn: () => client.leader.fees.account.get(clubId),
    staleTime: 30 * 1000,
    retry: retryUnlessNotFound,
  });
}

export function useUpsertFeeAccountMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FeeAccountPayload) => client.leader.fees.account.upsert(clubId, payload),
    // 운영진/동아리원 조회 모두 무효화한다(같은 계좌를 다른 엔드포인트로 본다).
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: feeQueryKeys.accountByClub(clubId) }),
  });
}

export function useDeleteFeeAccountMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.leader.fees.account.remove(clubId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: feeQueryKeys.accountByClub(clubId) }),
  });
}

// 동아리원 회비 입금 계좌 조회(AC-4). 미등록 시 ApiError(status 404) 를 surface 한다.
export function useMemberFeeAccountQuery(clubId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: feeQueryKeys.memberAccount(clubId),
    queryFn: () => client.clubs.feeAccount(clubId),
    staleTime: 30 * 1000,
    retry: retryUnlessNotFound,
  });
}
