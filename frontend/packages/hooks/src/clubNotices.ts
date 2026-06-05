import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateClubNoticePayload, UpdateClubNoticePayload } from '@duing/types';
import { useApiClient } from './api-context';
import { clubNoticeKeys } from './clubMembershipQueryKeys';

export function useClubNoticeListQuery(clubId: number, page = 0, size = 20) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubNoticeKeys.list(clubId, page, size),
    queryFn: () => client.clubNotices.listForClub(clubId, { page, size }),
    staleTime: 30 * 1000,
  });
}

export function useCreateClubNoticeMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClubNoticePayload) => client.clubNotices.create(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubNoticeKeys.byClub(clubId) });
    },
  });
}

export function useUpdateClubNoticeMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noticeId, payload }: { noticeId: number; payload: UpdateClubNoticePayload }) =>
      client.clubNotices.update(clubId, noticeId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubNoticeKeys.byClub(clubId) });
    },
  });
}

export function useRemoveClubNoticeMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: number) => client.clubNotices.remove(clubId, noticeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubNoticeKeys.byClub(clubId) });
    },
  });
}
