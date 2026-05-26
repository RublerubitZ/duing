import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminPromotionSearchParams,
  CreatePromotionPayload,
  UpdatePromotionPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

const publicPromotionKey = ['promotions', 'public'] as const;

/** 비로그인 사용자도 호출 가능한 공개 활성 배너 목록 (GET /promotions). */
export function usePublicPromotionsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: publicPromotionKey,
    queryFn: () => client.promotions.list(),
    staleTime: 60_000,
  });
}

export function useAdminPromotionListQuery(params: AdminPromotionSearchParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.promotionsList(params),
    queryFn: () => client.admin.promotions.list(params),
    staleTime: 15_000,
  });
}

export function useAdminPromotionDetailQuery(promotionId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: promotionId !== null
      ? adminQueryKeys.promotionsDetail(promotionId)
      : ['admin', 'promotions', 'detail', null],
    queryFn: () => {
      if (promotionId === null) {
        throw new Error('promotionId is required');
      }
      return client.admin.promotions.detail(promotionId);
    },
    enabled: promotionId !== null,
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
