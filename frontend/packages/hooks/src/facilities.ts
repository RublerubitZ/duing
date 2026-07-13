import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BookingStatus, CreateFacilityBookingPayload } from '@duing/types';

import { useApiClient } from './api-context';
import { facilityQueryKeys } from './facilityQueryKeys';

export function useFacilityUsageQuery(yearMonth?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: facilityQueryKeys.usage(yearMonth),
    queryFn: () => client.facilities.usage(yearMonth),
  });
}

export function useFacilityDetailQuery(facilityId: number | undefined, yearMonth?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      facilityId !== undefined
        ? facilityQueryKeys.detail(facilityId, yearMonth)
        : ['facilities', undefined],
    queryFn: () => {
      if (facilityId === undefined) {
        throw new Error('facilityId is required');
      }
      return client.facilities.get(facilityId, yearMonth);
    },
    enabled: facilityId !== undefined,
  });
}

export function useFacilityAvailabilityQuery(facilityId: number | undefined, yearMonth?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      facilityId !== undefined
        ? facilityQueryKeys.availability(facilityId, yearMonth)
        : ([...facilityQueryKeys.availabilityAll(), 'none'] as const),
    queryFn: () => {
      if (facilityId === undefined) throw new Error('facilityId is required');
      return client.facilities.availability(facilityId, yearMonth);
    },
    enabled: facilityId !== undefined,
  });
}

export function usePurposePresetsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: facilityQueryKeys.purposePresets(),
    queryFn: () => client.facilities.purposePresets(),
    // 시드 데이터(P2 전까지 사실상 불변) — 세션 내 재요청 억제
    staleTime: 60 * 60 * 1000,
  });
}

export function useCreateFacilityBookingMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { clubId: number; payload: CreateFacilityBookingPayload }) =>
      client.facilityBookings.create(input.clubId, input.payload),
    // 성공 시 해당 슬롯이 "승인 대기중" 으로 즉시 보이도록, §9.8: 실패(경합 409) 시에도 최신 슬롯
    // 상태로 재조회하도록 성공·실패 모두 가용성 캐시 전체를 무효화한다(no-store 계약과 합).
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: facilityQueryKeys.availabilityAll() });
    },
  });
}

export function useClubFacilityBookingsQuery(clubId: number | undefined, status?: BookingStatus) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined
        ? facilityQueryKeys.clubBookings(clubId, status)
        : ([...facilityQueryKeys.all, 'club-bookings', 'none'] as const),
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.facilityBookings.list(clubId, status);
    },
    enabled: clubId !== undefined,
  });
}

export function useFacilityBookingDetailQuery(clubId: number | undefined, bookingId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined && bookingId !== null
        ? facilityQueryKeys.clubBookingDetail(clubId, bookingId)
        : ([...facilityQueryKeys.all, 'club-bookings', 'detail-none'] as const),
    queryFn: () => {
      if (clubId === undefined || bookingId === null) throw new Error('clubId and bookingId are required');
      return client.facilityBookings.get(clubId, bookingId);
    },
    enabled: clubId !== undefined && bookingId !== null,
  });
}

export function useCancelFacilityBookingMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { clubId: number; bookingId: number }) =>
      client.facilityBookings.cancel(input.clubId, input.bookingId),
    // 취소로 목록·상세가 바뀌고, PENDING_HOLD 해제로 가용성 슬롯도 변한다. 실패 원인이 서버 측
    // 상태 변경(이미 승인 등)일 수 있어 실패 시에도 목록·상세·가용성을 재조회한다(생성 mutation
    // 의 onSettled 전례와 동일).
    onSettled: (_, __, input) => {
      queryClient.invalidateQueries({ queryKey: facilityQueryKeys.clubBookingsAll(input.clubId) });
      queryClient.invalidateQueries({ queryKey: facilityQueryKeys.availabilityAll() });
    },
  });
}
