import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClubEventListParams,
  CreateClubEventPayload,
  UpdateClubEventPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { clubEventKeys } from './clubEventQueryKeys';

export function useClubEventListQuery(clubId: number, params: ClubEventListParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubEventKeys.list(clubId, params),
    queryFn: () => client.clubEvents.list(clubId, params),
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
