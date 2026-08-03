import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type { MyClubMembership } from '@duing/types';
import { useApiClient } from './api-context';
import { clubMembershipKeys } from './clubMembershipQueryKeys';
import { isNonRetryableError } from './retry';

/** 멤버가 아니면 data 가 null 이다(200 + data:null). 오류는 실제 접근 거부·통신 실패만을 뜻한다. */
export function useClubMembershipQuery(clubId: number | null) {
  const client = useApiClient();
  const enabled = clubId !== null && Number.isFinite(clubId);
  return useQuery<MyClubMembership | null>({
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
      // 접근 거부(403)는 재시도해도 결과가 같고 가드가 즉시 redirect 한다. 404 는 이 엔드포인트가
      // 내지 않지만(없는 동아리도 200 + null) 다른 거부 응답이 생겨도 되풀이하지 않도록 함께 둔다.
      // 정규화된 ApiError.status 로 판별한다 — 예전 error.response.status 는 정규화 후 존재하지 않아
      // 이 분기가 사문화돼 있었다(잠복 버그).
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return false;
      return failureCount < 2;
    },
  });
}
