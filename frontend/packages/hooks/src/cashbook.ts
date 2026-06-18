import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CashbookSearchParams,
  CreateCashbookEntryPayload,
  UpdateCashbookEntryPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { cashbookQueryKeys } from './cashbookQueryKeys';

export function useCashbookEntriesQuery(clubId: number, params: CashbookSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: cashbookQueryKeys.list(clubId, params),
    queryFn: () => client.leader.cashbook.list(clubId, params),
    staleTime: 30 * 1000,
  });
}

export function useCashbookSummaryQuery(clubId: number, params: CashbookSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: cashbookQueryKeys.summary(clubId, params),
    queryFn: () => client.leader.cashbook.summary(clubId, params),
    staleTime: 30 * 1000,
  });
}

export function useCreateCashbookEntryMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCashbookEntryPayload) => client.leader.cashbook.create(clubId, payload),
    // 등록은 목록·요약 모두 바꾸므로 동아리 prefix 전체 무효화.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cashbookQueryKeys.byClub(clubId) }),
  });
}

export function useUpdateCashbookEntryMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, payload }: { entryId: number; payload: UpdateCashbookEntryPayload }) =>
      client.leader.cashbook.update(clubId, entryId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cashbookQueryKeys.byClub(clubId) }),
  });
}

export function useDeleteCashbookEntryMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) => client.leader.cashbook.remove(clubId, entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cashbookQueryKeys.byClub(clubId) }),
  });
}
