import { useQuery } from '@tanstack/react-query';
import type { ClubSearchParams } from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';

export function useManagedClubsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.managed(),
    queryFn: () => client.clubs.managedByMe(),
  });
}

export function useClubListQuery(params: ClubSearchParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.list(params),
    queryFn: () => client.clubs.list(params),
  });
}

export function useClubDetailQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.detail(clubId) : ['clubs', undefined],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.detail(clubId);
    },
    enabled: clubId !== undefined,
  });
}

export function useClubPhotosQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.photos(clubId) : ['clubs', undefined, 'photos'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.photos(clubId);
    },
    enabled: clubId !== undefined,
  });
}

export function useClubRecruitmentsQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined
        ? clubQueryKeys.recruitments(clubId)
        : ['clubs', undefined, 'recruitments'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.recruitmentsByClub(clubId);
    },
    enabled: clubId !== undefined,
  });
}