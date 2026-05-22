import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminPromotionSearchParams,
  CreatePromotionPayload,
  UpdatePromotionPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

export function useAdminPromotionListQuery(params: AdminPromotionSearchParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.promotionsList(params),
    queryFn: () => client.admin.promotions.list(params),
    staleTime: 15_000,
  });
}

export function useCreatePromotionMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePromotionPayload) => client.admin.promotions.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.promotionsAll });
    },
  });
}

export function useUpdatePromotionMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ promotionId, payload }: { promotionId: number; payload: UpdatePromotionPayload }) =>
      client.admin.promotions.update(promotionId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.promotionsAll });
    },
  });
}

export function useDeletePromotionMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (promotionId: number) => client.admin.promotions.delete(promotionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.promotionsAll });
    },
  });
}
