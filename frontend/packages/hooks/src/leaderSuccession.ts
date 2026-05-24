import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminClubMemberHistoryParams,
  AdminSuccessionSearchParams,
  AssignAdminLeaderPayload,
  ProcessSuccessionPayload,
  SubmitSuccessionRequestPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';
import { clubQueryKeys } from './clubQueryKeys';

export function useSubmitSuccessionRequestMutation(clubId: number) {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: SubmitSuccessionRequestPayload) =>
      client.leaderSuccession.submitRequest(clubId, payload),
  });
}

export function useAdminSuccessionListQuery(params: AdminSuccessionSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.leaderSuccessionList(params),
    queryFn: () => client.admin.leaderSuccession.list(params),
  });
}

export function useAdminSuccessionDetailQuery(requestId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.leaderSuccessionDetail(requestId ?? -1),
    queryFn: () => {
      if (requestId === null) throw new Error('requestId is null but query is enabled');
      return client.admin.leaderSuccession.get(requestId);
    },
    enabled: requestId !== null,
  });
}

export function useProcessSuccessionMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, payload }: { requestId: number; payload: ProcessSuccessionPayload }) =>
      client.admin.leaderSuccession.process(requestId, payload),
    onSuccess: (_, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.leaderSuccessionAll });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.leaderSuccessionDetail(requestId) });
    },
  });
}

export function useAssignAdminLeaderMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: number; payload: AssignAdminLeaderPayload }) =>
      client.admin.leaderSuccession.assignLeader(clubId, payload),
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.leaderSuccessionAll });
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.clubMemberHistory(clubId, {}),
        exact: false,
      });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
    },
  });
}

export function useAdminClubMemberHistoryQuery(clubId: number | null, params: AdminClubMemberHistoryParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.clubMemberHistory(clubId ?? -1, params),
    queryFn: () => {
      if (clubId === null) throw new Error('clubId is null but query is enabled');
      return client.admin.leaderSuccession.memberHistory(clubId, params);
    },
    enabled: clubId !== null,
  });
}
