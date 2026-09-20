import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AdminClubActivityEventsParams } from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

/** 관리자 동아리 활동 이력. 칩·페이지 전환 중 이전 목록을 유지한다(회비 감사 로그 선례). */
export function useAdminClubActivityEventsQuery(clubId: number, params: AdminClubActivityEventsParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.clubActivityEvents(clubId, params),
    queryFn: () => client.admin.clubActivity.events(clubId, params),
    placeholderData: keepPreviousData,
  });
}
