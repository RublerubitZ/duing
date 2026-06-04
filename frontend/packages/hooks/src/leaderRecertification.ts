import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LeaderRecertificationContext,
  SubmitRecertificationRequestPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { leaderRecertificationKeys } from './leaderRecertificationQueryKeys';

export function useRecertificationContextQuery(
  clubId: number | null,
  options?: { enabled?: boolean },
) {
  const client = useApiClient();
  const enabled =
    (options?.enabled ?? true) && clubId !== null && Number.isFinite(clubId);
  return useQuery<LeaderRecertificationContext>({
    queryKey:
      clubId === null
        ? leaderRecertificationKeys.all
        : leaderRecertificationKeys.context(clubId),
    queryFn: () => {
      if (clubId === null) throw new Error('clubId is null but query is enabled');
      return client.recertificationRequests.context(clubId);
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useSubmitRecertificationRequestMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitRecertificationRequestPayload) =>
      client.recertificationRequests.submit(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: leaderRecertificationKeys.context(clubId),
      });
    },
  });
}
