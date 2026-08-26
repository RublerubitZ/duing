import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClubMemberExportRow,
  ClubMemberPhone,
  ClubSearchParams,
  CreateClubPhotoPayload,
  ReorderClubPhotosPayload,
  TransferLeaderResult,
  UpdateClubPayload,
  UpdateClubPhotoPayload,
  UpdateMemberRolePayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';
import { CALENDAR_STALE_TIME_MS, PUBLIC_CONTENT_STALE_TIME_MS } from './freshness';
import { userQueryKeys } from './userQueryKeys';

export function useManagedClubsQuery(options?: { enabled?: boolean }) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.managed(),
    queryFn: () => client.clubs.managedByMe(),
    enabled: options?.enabled ?? true,
  });
}

export function useMyClubsQuery(options?: { enabled?: boolean }) {
  const client = useApiClient();
  return useQuery({
    queryKey: userQueryKeys.myClubs(),
    queryFn: () => client.users.myClubs(),
    enabled: options?.enabled ?? true,
  });
}

export function useClubListQuery(params: ClubSearchParams = {}, options?: { enabled?: boolean }) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.list(params),
    queryFn: () => client.clubs.list(params),
    // 필터·페이지 변경 시 스켈레톤으로 리셋하지 않고 이전 목록을 유지한 채 갱신한다.
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useClubDetailQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.detail(clubId) : ['clubs', undefined],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.detail(clubId);
    },
    enabled: clubId !== undefined,
    // 공개 콘텐츠 계층(freshness.ts) — 본인 수정은 mutation 무효화가 즉시 반영한다.
    staleTime: PUBLIC_CONTENT_STALE_TIME_MS,
  });
}

export function useClubPhotosQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.photos(clubId) : ['clubs', undefined, 'photos'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.photos(clubId);
    },
    enabled: clubId !== undefined,
    staleTime: PUBLIC_CONTENT_STALE_TIME_MS,
  });
}

export function useClubRecruitmentsQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined
        ? clubQueryKeys.recruitments(clubId)
        : ['clubs', undefined, 'recruitments'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.recruitmentsByClub(clubId);
    },
    enabled: clubId !== undefined,
    // 모집 축은 마감 표시 지연을 2분 이내로 묶는다 — 지원 클릭은 eligibility 재확인이 최종 게이트.
    staleTime: CALENDAR_STALE_TIME_MS,
  });
}

export function useUpdateClubMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateClubPayload) => client.clubs.update(clubId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(clubQueryKeys.detail(clubId), updated);
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.managed() });
    },
  });
}

export function useCreatePhotoMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClubPhotoPayload) => client.clubs.createPhoto(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.photos(clubId) });
    },
  });
}

export function useUpdatePhotoMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId, payload }: { photoId: number; payload: UpdateClubPhotoPayload }) =>
      client.clubs.updatePhoto(clubId, photoId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.photos(clubId) });
    },
  });
}

export function useReorderPhotosMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReorderClubPhotosPayload) => client.clubs.reorderPhotos(clubId, payload),
    onSuccess: (reordered) => {
      queryClient.setQueryData(clubQueryKeys.photos(clubId), reordered);
    },
  });
}

export function useDeletePhotoMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) => client.clubs.deletePhoto(clubId, photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.photos(clubId) });
    },
  });
}

export function useClubMembersQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.members(clubId) : ['clubs', undefined, 'members'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.members(clubId);
    },
    enabled: clubId !== undefined,
  });
}

export function useUpdateMemberRoleMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, payload }: { memberId: number; payload: UpdateMemberRolePayload }) =>
      client.clubs.updateMemberRole(clubId, memberId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
    },
  });
}

export function useUpdateMemberGenerationMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, payload }: { memberId: number; payload: { generation: number | null } }) =>
      client.clubs.updateMemberGeneration(clubId, memberId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
    },
  });
}

export function useRemoveMemberMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: number) => client.clubs.removeMember(clubId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
    },
  });
}

export function useLeaveClubMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.clubs.leaveClub(clubId),
    onSuccess: () => {
      // 떠난 동아리는 멤버·관리 목록과 마이페이지의 내 동아리 목록에서 빠져야 한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.managed() });
      queryClient.invalidateQueries({ queryKey: userQueryKeys.myClubs() });
      // 회원 전용 뷰가 멤버십 여부에 따라 달라지므로 해당 동아리 상세도 갱신한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
    },
  });
}

export function useTransferLeaderMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: number): Promise<TransferLeaderResult> =>
      client.clubs.transferLeader(clubId, memberId),
    onSuccess: () => {
      // 본인이 OFFICER 로 강등되었으므로 me() 와 managed() 도 무효화.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.managed() });
      queryClient.invalidateQueries({ queryKey: userQueryKeys.me() });
    },
  });
}

export function useClubMembersExportMutation(clubId: number) {
  const client = useApiClient();
  return useMutation({
    // memberIds 를 넘기면 그 멤버만 받는다 — 화면에 없는 회원의 전화번호까지 내려받지 않는다.
    mutationFn: (variables: {
      includePhone: boolean;
      memberIds?: number[];
    }): Promise<ClubMemberExportRow[]> =>
      client.clubs.membersExport(clubId, variables.includePhone, variables.memberIds),
  });
}

/**
 * 회원 원본 연락처 조회. 쿼리가 아니라 뮤테이션인 이유는 캐시를 남기지 않기 위해서다 —
 * 캐시에 원본이 남으면 패널을 다시 열었을 때 감사 로그 없이 번호가 되살아나고,
 * "패널을 닫으면 다시 마스킹" 정책이 무너진다.
 */
export function useMemberPhoneMutation(clubId: number) {
  const client = useApiClient();
  return useMutation({
    mutationFn: (memberId: number): Promise<ClubMemberPhone> =>
      client.clubs.memberPhone(clubId, memberId),
  });
}
