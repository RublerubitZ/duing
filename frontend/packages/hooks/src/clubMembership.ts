import { useQuery } from '@tanstack/react-query';
import type { MyClubMembership } from '@duing/types';
import { useApiClient } from './api-context';
import { clubMembershipKeys } from './clubMembershipQueryKeys';

export function useClubMembershipQuery(clubId: number | null) {
  const client = useApiClient();
  const enabled = clubId !== null && Number.isFinite(clubId);
  return useQuery<MyClubMembership>({
    queryKey: clubId === null
      ? clubMembershipKeys.all
      : clubMembershipKeys.byClub(clubId),
    queryFn: () => {
      if (clubId === null) throw new Error('clubId is null but query is enabled');
      return client.clubMembership.get(clubId);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      // 비-멤버(403) 또는 클럽 없음(404) 은 재시도하지 않고 가드가 즉시 redirect 한다
      if (status === 404 || status === 403) return false;
      return failureCount < 2;
    },
  });
}
