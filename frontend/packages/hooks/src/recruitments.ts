import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRecruitmentPayload, UpdateRecruitmentPayload } from '@duing/types';
import { useApiClient } from './api-context';

export function useCreateRecruitment(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRecruitmentPayload) =>
      client.recruitments.create(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'recruitments'] });
    },
  });
}

export function useRecruitmentCalendar(yearMonth: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['recruitments', 'calendar', yearMonth],
    queryFn: () => client.recruitments.calendar(yearMonth),
  });
}

export function useRecruitmentDetail(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['recruitments', recruitmentId],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.recruitments.detail(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useUpdateRecruitment(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateRecruitmentPayload) =>
      client.recruitments.update(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitments', recruitmentId] });
    },
  });
}

export function useCloseRecruitment(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.recruitments.close(recruitmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitments', recruitmentId] });
    },
  });
}
