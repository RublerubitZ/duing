import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type { MyClubMembership } from '@duing/types';
import { useApiClient } from './api-context';
import { clubMembershipKeys } from './clubMembershipQueryKeys';
import { isNonRetryableError } from './retry';

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
      if (isNonRetryableError(error)) return false;
      // 비-멤버(403) 또는 클럽 없음(404) 은 재시도하지 않고 가드가 즉시 redirect 한다.
      // 정규화된 ApiError.status 로 판별한다 — 예전 error.response.status 는 정규화 후 존재하지 않아
      // 이 분기가 사문화돼 있었다(잠복 버그).
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return false;
      return failureCount < 2;
    },
  });
}
