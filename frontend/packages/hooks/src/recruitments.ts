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
    queryFn: () => client.recruitments.detail(recruitmentId as number),
    enabled: recruitmentId !== undefined,
  });
}
