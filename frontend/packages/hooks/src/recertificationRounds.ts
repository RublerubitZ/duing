import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminRecertificationRoundSearchParams,
  CreateRecertificationRoundPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

export function useAdminRecertificationRoundListQuery(params: AdminRecertificationRoundSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.recertificationRoundsList(params),
    queryFn: () => client.admin.recertificationRounds.list(params),
  });
}

export function useCreateRecertificationRoundMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRecertificationRoundPayload) =>
      client.admin.recertificationRounds.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.recertificationRoundsAll });
    },
  });
}

export function useCloseRecertificationRoundMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roundId: number) => client.admin.recertificationRounds.close(roundId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.recertificationRoundsAll });
    },
  });
}
