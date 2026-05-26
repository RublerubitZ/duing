import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminRecertificationRequestSearchParams,
  CentralClubRecertificationStatusParams,
  ProcessRecertificationPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

export function useAdminRecertificationRequestListQuery(
  params: AdminRecertificationRequestSearchParams,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.recertificationRequestsList(params),
    queryFn: () => client.admin.recertificationRequests.list(params),
  });
}

export function useAdminRecertificationRequestDetailQuery(requestId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.recertificationRequestsDetail(requestId ?? -1),
    queryFn: () => {
      if (requestId === null) throw new Error('requestId is null but query is enabled');
      return client.admin.recertificationRequests.get(requestId);
    },
    enabled: requestId !== null,
  });
}

export function useProcessRecertificationMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: number;
      payload: ProcessRecertificationPayload;
    }) => client.admin.recertificationRequests.process(requestId, payload),
    onSuccess: (_, { requestId }) => {
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.recertificationRequestsAll,
      });
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.recertificationRequestsDetail(requestId),
      });
    },
  });
}

export function useCentralClubRecertificationStatusQuery(
  params: CentralClubRecertificationStatusParams | null,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.centralClubRecertificationStatus(
      params ?? { operatingYear: 0 },
    ),
    queryFn: () => {
      if (params === null)
        throw new Error('params is null but query is enabled');
      return client.admin.recertificationRequests.centralClubStatus(params);
    },
    enabled: params !== null,
  });
}
