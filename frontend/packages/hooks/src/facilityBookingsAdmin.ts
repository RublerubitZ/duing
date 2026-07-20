import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBookingQueueParams } from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';
import { facilityQueryKeys } from './facilityQueryKeys';

export function useAdminFacilityBookingQueueQuery(
  params: AdminBookingQueueParams,
  options?: { enabled?: boolean },
) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.facilityBookingQueue(params),
    queryFn: () => client.admin.facilityBookings.queue(params),
    enabled: options?.enabled ?? true,
  });
}

export function useAdminFacilityBookingDetailQuery(bookingId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      bookingId !== null
        ? adminQueryKeys.facilityBookingDetail(bookingId)
        : ([...adminQueryKeys.facilityBookingsAll, 'detail-none'] as const),
    queryFn: () => {
      if (bookingId === null) throw new Error('bookingId is required');
      return client.admin.facilityBookings.detail(bookingId);
    },
    enabled: bookingId !== null,
  });
}

export function useAdminFacilityBookingSummaryQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.facilityBookingSummary(),
    queryFn: () => client.admin.facilityBookings.summary(),
  });
}

function useAdminBookingInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    // 액션은 큐·상세·summary 를 모두 바꾸고, 승인/취소는 예약 홈 가용성(HOLD/차단)에도 반영된다.
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilityBookingsAll });
    void queryClient.invalidateQueries({ queryKey: facilityQueryKeys.availabilityAll() });
    // 승인/반려/취소는 학교 제출 후보(제출 필요 목록)의 파생에도 반영된다 — 교차 무효화(PR-2 최종 리뷰 이월).
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilitySubmissionAll });
    // 사이드바 뱃지 — 승인/반려/취소·충돌 처리 즉시 숫자가 줄어야 한다.
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
  };
}

export function useApproveFacilityBookingMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number }) => client.admin.facilityBookings.approve(input.bookingId),
    onSettled: invalidate,
  });
}

export function useRejectFacilityBookingMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number; reason: string }) =>
      client.admin.facilityBookings.reject(input.bookingId, input.reason),
    onSettled: invalidate,
  });
}

export function useConfirmFacilityBookingMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number }) => client.admin.facilityBookings.confirm(input.bookingId),
    onSettled: invalidate,
  });
}

export function useMarkConflictFacilityBookingMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number; detail: string }) =>
      client.admin.facilityBookings.markConflict(input.bookingId, input.detail),
    onSettled: invalidate,
  });
}

export function useCancelFacilityBookingAdminMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number; reason: string }) =>
      client.admin.facilityBookings.cancel(input.bookingId, input.reason),
    onSettled: invalidate,
  });
}
