import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateFacilityBookingOpenDatePayload } from '@duing/types';

import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';
import { facilityQueryKeys } from './facilityQueryKeys';

/** 시설 예약 오픈일 관리 목록(총동연) — 활성 시설 + 오픈일(null = 닫힘). */
export function useAdminFacilitiesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.facilities(),
    queryFn: () => client.admin.facilities.list(),
  });
}

function useInvalidateFacilityOpenDate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilitiesAll });
    // 오픈일은 가용성 bookableFrom·홈 카드(usage/list) 에 즉시 반영돼야 한다 — facilities 접두사 전체 무효화.
    void queryClient.invalidateQueries({ queryKey: facilityQueryKeys.all });
  };
}

export function useUpdateFacilityBookingOpenDateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateFacilityOpenDate();
  return useMutation({
    mutationFn: (input: { facilityId: number; payload: UpdateFacilityBookingOpenDatePayload }) =>
      client.admin.facilities.updateBookingOpenDate(input.facilityId, input.payload),
    onSuccess: invalidate,
  });
}

/** 활성 시설 전체 일괄 적용 — 서버가 단일 트랜잭션으로 처리해 부분 적용이 없다(D8). */
export function useUpdateAllFacilityBookingOpenDateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateFacilityOpenDate();
  return useMutation({
    mutationFn: (payload: UpdateFacilityBookingOpenDatePayload) =>
      client.admin.facilities.updateAllBookingOpenDate(payload),
    onSuccess: invalidate,
  });
}
