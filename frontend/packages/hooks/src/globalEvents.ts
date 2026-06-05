import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminGlobalEventListParams,
  CreateGlobalEventPayload,
  GlobalEventListParams,
  UpdateGlobalEventPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { globalEventKeys } from './globalEventQueryKeys';

export function useGlobalEventListQuery(params: GlobalEventListParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.publicList(params),
    queryFn: () => client.globalEvents.list(params),
    staleTime: 30 * 1000,
  });
}

export function useGlobalEventDetailQuery(eventId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.publicDetail(eventId ?? -1),
    queryFn: () => {
      if (eventId === null) throw new Error('eventId is null');
      return client.globalEvents.get(eventId);
    },
    enabled: eventId !== null,
    staleTime: 30 * 1000,
  });
}

export function useAdminGlobalEventListQuery(params: AdminGlobalEventListParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.adminList(params),
    queryFn: () => client.admin.globalEvents.list(params),
    staleTime: 15 * 1000,
  });
}

export function useAdminGlobalEventDetailQuery(eventId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.adminDetail(eventId ?? -1),
    queryFn: () => {
      if (eventId === null) throw new Error('eventId is null');
      return client.admin.globalEvents.detail(eventId);
    },
    enabled: eventId !== null,
    staleTime: 15 * 1000,
  });
}

export function useGlobalEventCategoryStatsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.categoryStats(),
    queryFn: () => client.admin.globalEvents.categoryStats(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminGlobalEventCreateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateGlobalEventPayload) => client.admin.globalEvents.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: globalEventKeys.all });
    },
  });
}

export function useAdminGlobalEventUpdateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, payload }: { eventId: number; payload: UpdateGlobalEventPayload }) =>
      client.admin.globalEvents.update(eventId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: globalEventKeys.all });
      queryClient.invalidateQueries({ queryKey: globalEventKeys.adminDetail(variables.eventId) });
    },
  });
}

export function useAdminGlobalEventDeleteMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => client.admin.globalEvents.remove(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: globalEventKeys.all });
    },
  });
}
