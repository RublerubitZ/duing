import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClubEventListParams,
  CreateClubEventPayload,
  UpdateClubEventPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { clubEventKeys } from './clubEventQueryKeys';
import { CALENDAR_STALE_TIME_MS } from './freshness';

export function useClubEventListQuery(clubId: number, params: ClubEventListParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubEventKeys.list(clubId, params),
    queryFn: () => client.clubEvents.list(clubId, params),
    // 캘린더 축 계층(freshness.ts) — 일정 CRUD 는 byClub 무효화가 즉시 반영한다.
    staleTime: CALENDAR_STALE_TIME_MS,
  });
}

export function useClubEventDetailQuery(clubId: number, eventId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubEventKeys.detail(clubId, eventId ?? -1),
    queryFn: () => {
      if (eventId === null) throw new Error('eventId is null');
      return client.clubEvents.get(clubId, eventId);
    },
    enabled: eventId !== null,
    staleTime: CALENDAR_STALE_TIME_MS,
  });
}

export function useCreateClubEventMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClubEventPayload) => client.clubEvents.create(clubId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clubEventKeys.byClub(clubId) }),
  });
}

export function useUpdateClubEventMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, payload }: { eventId: number; payload: UpdateClubEventPayload }) =>
      client.clubEvents.update(clubId, eventId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clubEventKeys.byClub(clubId) }),
  });
}

export function useRemoveClubEventMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => client.clubEvents.remove(clubId, eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clubEventKeys.byClub(clubId) }),
  });
}
