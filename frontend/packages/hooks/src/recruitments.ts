import { useQuery } from '@tanstack/react-query';
import { useApiClient } from './api-context';

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
