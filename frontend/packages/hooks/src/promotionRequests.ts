import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type {
  AdminPromotionRequestSearchParams,
  ProcessPromotionRequestPayload,
  SubmitPromotionRequestPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';
import { clubQueryKeys } from './clubQueryKeys';
import { retryUnlessStatuses } from './retry';

// 404 는 API 가 아직 없다는 뜻이다(FE 선배포·BE 롤백 중) — 다시 물어도 같아 방문마다 요청만 두 배가 된다.
const retryUnlessNotFound = retryUnlessStatuses(404);

/** 운영 홈의 최근 홍보 요청 1건. 요청한 적이 없으면 null. */
export function useLatestPromotionRequestQuery(clubId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.latestPromotionRequest(clubId),
    queryFn: () => client.promotionRequests.latest(clubId),
    retry: retryUnlessNotFound,
  });
}

export const useSubmitPromotionRequestMutation = (clubId: number) => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const invalidateLatest = () =>
    queryClient.invalidateQueries({ queryKey: clubQueryKeys.latestPromotionRequest(clubId) });
  return useMutation({
    mutationFn: (payload: SubmitPromotionRequestPayload) =>
      client.promotionRequests.submit(clubId, payload),
    onSuccess: () => {
      void invalidateLatest();
    },
    // 409 는 다른 운영진이 먼저 낸 요청이 대기 중이라는 뜻 — 다시 받아 곧바로 "검토 대기 중"으로 바꾼다.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) void invalidateLatest();
    },
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
      // 사이드바 뱃지 — 처리 즉시 숫자가 줄어야 한다.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
    },
  });
}
