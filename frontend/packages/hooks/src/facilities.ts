import { useQuery } from '@tanstack/react-query';

import { useApiClient } from './api-context';
import { facilityQueryKeys } from './facilityQueryKeys';

export function useFacilityUsageQuery(yearMonth?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: facilityQueryKeys.usage(yearMonth),
    queryFn: () => client.facilities.usage(yearMonth),
  });
}

export function useFacilityDetailQuery(facilityId: number | undefined, yearMonth?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      facilityId !== undefined
        ? facilityQueryKeys.detail(facilityId, yearMonth)
        : ['facilities', undefined],
    queryFn: () => {
      if (facilityId === undefined) {
        throw new Error('facilityId is required');
      }
      return client.facilities.get(facilityId, yearMonth);
    },
    enabled: facilityId !== undefined,
  });
}
