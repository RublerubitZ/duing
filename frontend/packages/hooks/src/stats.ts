import { useQuery } from '@tanstack/react-query';
import { useApiClient } from './api-context';
import { statsQueryKeys } from './statsQueryKeys';

export function useRecruitmentStatsSummaryQuery(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      recruitmentId !== undefined
        ? statsQueryKeys.summary(recruitmentId)
        : ['stats', undefined, 'summary'],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.stats.summary(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useRecruitmentStatsDailyQuery(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      recruitmentId !== undefined
        ? statsQueryKeys.daily(recruitmentId)
        : ['stats', undefined, 'daily'],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.stats.daily(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useRecruitmentStatsFunnelQuery(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      recruitmentId !== undefined
        ? statsQueryKeys.funnel(recruitmentId)
        : ['stats', undefined, 'funnel'],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.stats.funnel(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}