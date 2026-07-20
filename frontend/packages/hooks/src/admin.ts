import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminClubSearchParams,
  AdminUserSearchParams,
  CloseClubPayload,
  CreateClubPayload,
  UpdateClubCentralClubPayload,
  UpdateClubStatusPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';
import { clubQueryKeys } from './clubQueryKeys';

/**
 * 콘솔 사이드바 뱃지용 미처리 건수. 전역 staleTime(30초)을 그대로 써서, 사이드바가 다시 마운트되거나
 * 캐시가 만료된 뒤 진입하면 자연스럽게 갱신된다(폴링 없음). 처리 직후 반영은 각 도메인 뮤테이션이
 * 이 키를 무효화해 담당한다.
 */
export function useAdminPendingCountsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.pendingCounts(),
    queryFn: () => client.admin.pendingCounts(),
  });
}

export function useAdminClubsQuery(params: AdminClubSearchParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.clubsList(params),
    queryFn: () => client.admin.clubs.list(params),
  });
}

export function useAdminClubDetailQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? adminQueryKeys.clubsDetail(clubId) : ['admin', 'clubs', 'detail', undefined],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.admin.clubs.detail(clubId);
    },
    enabled: clubId !== undefined,
  });
}

/**
 * 동아리장 후보 검색. 검색어가 비어있으면 백엔드 400 이 떨어지므로 `enabled` 로 가드한다.
 */
export function useAdminUserSearchQuery(params: AdminUserSearchParams) {
  const client = useApiClient();
  const trimmedQuery = params.q.trim();
  return useQuery({
    queryKey: adminQueryKeys.usersSearch({ ...params, q: trimmedQuery }),
    queryFn: () => client.admin.users.search({ ...params, q: trimmedQuery }),
    enabled: trimmedQuery.length > 0,
  });
}

/**
 * 회원 강제 로그아웃. 대상의 tokenVersion 을 범프해 전 세션·리프레시를 폐기한다.
 * 검색 결과 캐시(usersSearch)는 세션 상태를 담지 않으므로 무효화하지 않는다.
 */
export function useAdminForceLogoutMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (userId: number) => client.admin.users.forceLogout(userId),
  });
}

export function useCreateClubMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClubPayload) => client.clubs.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
      // 새 동아리는 승인 대기로 생성되므로 뱃지가 늘어야 한다.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
    },
  });
}

export function useUpdateClubStatusMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: number; payload: UpdateClubStatusPayload }) =>
      client.clubs.updateStatus(clubId, payload),
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
      // 사이드바 뱃지 — 승인/반려 즉시 승인 대기 수가 줄어야 한다.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
    },
  });
}

export function useCloseClubMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: number; payload: CloseClubPayload }) =>
      client.clubs.close(clubId, payload),
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
    },
  });
}

export function useUpdateClubCentralClubMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: number; payload: UpdateClubCentralClubPayload }) =>
      client.clubs.updateCentralClub(clubId, payload),
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
    },
  });
}
