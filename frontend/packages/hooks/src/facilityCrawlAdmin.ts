import { useQuery } from '@tanstack/react-query';
import type { AdminCrawlReservationParams } from '@duing/types';

import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

/** 어드민 크롤 예약 현황(전면 차단 설계 §3.6) — 그룹 단위 페이징이라 params 전체가 키다. */
export function useAdminCrawlReservationsQuery(params: AdminCrawlReservationParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.facilityCrawlReservations(params),
    queryFn: () => client.admin.facilityCrawl.reservations(params),
  });
}
