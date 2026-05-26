import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminPromotionRequestSearchParams,
  ProcessPromotionRequestPayload,
  SubmitPromotionRequestPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

export const useSubmitPromotionRequestMutation = (clubId: number) => {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: SubmitPromotionRequestPayload) =>
      client.promotionRequests.submit(clubId, payload),
  });
};

export function useAdminPromotionRequestListQuery(
  params: AdminPromotionRequestSearchParams,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.promotionRequestsList(params),
    queryFn: () => client.admin.promotionRequests.list(params),
  });
}

export function useAdminPromotionRequestDetailQuery(requestId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.promotionRequestsDetail(requestId ?? -1),
    queryFn: () => {
      if (requestId === null)
        throw new Error('requestId is null but query is enabled');
      return client.admin.promotionRequests.get(requestId);
    },
    enabled: requestId !== null,
  });
}

export function useProcessPromotionRequestMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: number;
      payload: ProcessPromotionRequestPayload;
    }) => client.admin.promotionRequests.process(requestId, payload),
    onSuccess: (_, { requestId }) => {
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.promotionRequestsAll,
      });
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.promotionRequestsDetail(requestId),
      });
    },
  });
}
