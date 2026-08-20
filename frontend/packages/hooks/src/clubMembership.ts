import { useQuery } from '@tanstack/react-query';
import type { MyClubMembership } from '@duing/types';
import { useApiClient } from './api-context';
import { clubMembershipKeys } from './clubMembershipQueryKeys';
import { retryUnlessStatuses } from './retry';

// 404 는 이 엔드포인트가 내지 않지만(없는 동아리도 200 + null) 다른 거부 응답이 생겨도 되풀이하지
// 않도록 막아 둔다. 접근 거부(403)는 전역 비재시도 집합에 이미 있어 따로 넘기지 않는다 —
// 정규화된 ApiError.status 로 판별한다(예전 error.response.status 는 정규화 후 존재하지 않아
// 이 분기가 사문화돼 있었다 — 잠복 버그).
const retryUnlessNotFound = retryUnlessStatuses(404);

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
    retry: retryUnlessNotFound,
  });
}
