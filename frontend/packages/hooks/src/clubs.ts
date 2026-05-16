import { useQuery } from '@tanstack/react-query';
import type { ClubSearchParams } from '@duing/types';
import { useApiClient } from './api-context';

export function useManagedClubs() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['clubs', 'managed'],
    queryFn: () => client.clubs.managedByMe(),
  });
}

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
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.detail(clubId);
    },
    enabled: clubId !== undefined,
  });
}

export function useClubPhotos(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['clubs', clubId, 'photos'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.photos(clubId);
    },
    enabled: clubId !== undefined,
  });
}

export function useClubRecruitments(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['clubs', clubId, 'recruitments'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.recruitmentsByClub(clubId);
    },
    enabled: clubId !== undefined,
  });
}