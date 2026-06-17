import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BillSearchParams,
  CreateFeePolicyPayload,
  GenerateBillsPayload,
  MyFeeSearchParams,
  UpdateFeePolicyPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { feeQueryKeys } from './feeQueryKeys';

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
