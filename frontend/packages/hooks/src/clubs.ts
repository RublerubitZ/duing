import { useQuery } from '@tanstack/react-query';
import type { ClubSearchParams } from '@duing/types';
import { useApiClient } from './api-context';

export function useClubList(params: ClubSearchParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['clubs', params],
    queryFn: () => client.clubs.list(params),
  });
}

export function useClubDetail(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['clubs', clubId],
    queryFn: () => client.clubs.detail(clubId as number),
    enabled: clubId !== undefined,
  });
}
