import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
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
import { userQueryKeys } from './userQueryKeys';

export function useManagedClubsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.managed(),
    queryFn: () => client.clubs.managedByMe(),
  });
}

export function useClubListQuery(params: ClubSearchParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.list(params),
    queryFn: () => client.clubs.list(params),
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
      // 떠난 동아리는 managed 목록에서 빠져야 한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.managed() });
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
