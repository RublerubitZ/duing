import { useQuery } from '@tanstack/react-query';
import { useApiClient } from './api-context';

export function useRecruitmentStatsSummary(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['stats', recruitmentId, 'summary'],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.stats.summary(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useRecruitmentStatsDaily(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['stats', recruitmentId, 'daily'],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.stats.daily(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useRecruitmentStatsFunnel(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['stats', recruitmentId, 'funnel'],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.stats.funnel(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}