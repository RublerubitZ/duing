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
import { retryUnlessStatuses } from './retry';

// 404 는 API 가 아직 없다는 뜻이다(FE 선배포·BE 롤백 중) — 다시 물어도 같아 방문마다 요청만 두 배가 된다.
const retryUnlessNotFound = retryUnlessStatuses(404);

/** 부원 관리의 "내 최근 승계 요청" 1건. 요청한 적이 없으면 null. */
export function useMyLatestLeaderSuccessionRequestQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined
        ? clubQueryKeys.myLatestLeaderSuccessionRequest(clubId)
        : ['clubs', undefined, 'leader-succession-request', 'me', 'latest'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.leaderSuccession.myLatest(clubId);
    },
    enabled: clubId !== undefined,
    retry: retryUnlessNotFound,
  });
}

export function useSubmitSuccessionRequestMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitSuccessionRequestPayload) =>
      client.leaderSuccession.submitRequest(clubId, payload),
    // 성공·실패 모두 내 최근 요청을 다시 받는다 — 시간 초과·5xx 인데 서버는 커밋한 경우도 곧바로 "검토 대기 중"으로 맞춰진다.
    // 다른 임원의 대기 요청 때문에 난 409 는 "내 요청"이 그대로라 화면이 바뀌지 않는다(다시 받아도 무해).
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.myLatestLeaderSuccessionRequest(clubId) }),
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
      // 사이드바 뱃지 — 처리 즉시 숫자가 줄어야 한다.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
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
