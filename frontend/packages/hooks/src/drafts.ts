import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpsertDraftPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { draftQueryKeys } from './draftQueryKeys';

export function useApplicationDraftQuery(recruitmentId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: draftQueryKeys.byRecruitment(recruitmentId),
    queryFn: () => client.drafts.get(recruitmentId),
  });
}

export function useApplicationDraftMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertDraftPayload) => client.drafts.upsert(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: draftQueryKeys.byRecruitment(recruitmentId),
      });
    },
  });
}

export function useDeleteApplicationDraftMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.drafts.remove(recruitmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: draftQueryKeys.byRecruitment(recruitmentId),
      });
    },
  });
}
