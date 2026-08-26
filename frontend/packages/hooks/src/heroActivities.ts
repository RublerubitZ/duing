import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateHeroActivityPayload,
  ReorderHeroActivitiesPayload,
  UpdateHeroActivityPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';
import { PUBLIC_CONTENT_STALE_TIME_MS } from './freshness';

export function useClubHeroActivitiesQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined
        ? clubQueryKeys.heroActivities(clubId)
        : ['clubs', undefined, 'hero-activities'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.heroActivities(clubId);
    },
    enabled: clubId !== undefined,
    // 공개 콘텐츠 계층(freshness.ts) — 본인 수정은 mutation 무효화가 즉시 반영한다.
    staleTime: PUBLIC_CONTENT_STALE_TIME_MS,
  });
}

export function useCreateHeroActivityMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHeroActivityPayload) => client.clubs.createHeroActivity(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.heroActivities(clubId) });
      // 새 사진 업로드 경로가 동아리 사진 목록도 바꾸므로 함께 무효화한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.photos(clubId) });
    },
  });
}

export function useUpdateHeroActivityMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      heroActivityId,
      payload,
    }: {
      heroActivityId: number;
      payload: UpdateHeroActivityPayload;
    }) => client.clubs.updateHeroActivity(clubId, heroActivityId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.heroActivities(clubId) });
      // 사진 교체(신규 업로드) 경로가 동아리 사진 목록도 바꾸므로 함께 무효화한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.photos(clubId) });
    },
  });
}

export function useReorderHeroActivitiesMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReorderHeroActivitiesPayload) =>
      client.clubs.reorderHeroActivities(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.heroActivities(clubId) });
    },
  });
}

export function useDeleteHeroActivityMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (heroActivityId: number) => client.clubs.deleteHeroActivity(clubId, heroActivityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.heroActivities(clubId) });
    },
  });
}
