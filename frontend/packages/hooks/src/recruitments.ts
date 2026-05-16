import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRecruitmentPayload, UpdateRecruitmentPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';
import { recruitmentQueryKeys } from './recruitmentQueryKeys';

export function useCreateRecruitmentMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRecruitmentPayload) =>
      client.recruitments.create(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.recruitments(clubId) });
    },
  });
}

export function useRecruitmentCalendarQuery(yearMonth: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: recruitmentQueryKeys.calendar(yearMonth),
    queryFn: () => client.recruitments.calendar(yearMonth),
  });
}

export function useRecruitmentDetailQuery(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      recruitmentId !== undefined
        ? recruitmentQueryKeys.detail(recruitmentId)
        : ['recruitments', undefined],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.recruitments.detail(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useUpdateRecruitmentMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateRecruitmentPayload) =>
      client.recruitments.update(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.detail(recruitmentId) });
    },
  });
}

export function useCloseRecruitmentMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.recruitments.close(recruitmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.detail(recruitmentId) });
    },
  });
}