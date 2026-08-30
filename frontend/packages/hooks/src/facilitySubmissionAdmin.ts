import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSubmissionBatchPayload,
  SubmissionBatchListParams,
  SubmissionCandidatesParams,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

export function useSubmissionCandidatesQuery(params: SubmissionCandidatesParams | null) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      params !== null
        ? adminQueryKeys.facilitySubmissionCandidates(params)
        : ([...adminQueryKeys.facilitySubmissionAll, 'candidates-none'] as const),
    queryFn: () => {
      if (params === null) throw new Error('유효한 조회 기간이 필요합니다');
      return client.admin.facilitySubmission.candidates(params);
    },
    enabled: params !== null,
  });
}

function useSubmissionInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilitySubmissionAll });
  };
}

export function useCreateSubmissionBatchMutation() {
  const client = useApiClient();
  const invalidate = useSubmissionInvalidation();
  return useMutation({
    mutationFn: (payload: CreateSubmissionBatchPayload) => client.admin.facilitySubmission.create(payload),
    onSettled: invalidate,
  });
}

export function useDownloadSubmissionCsvMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (input: { batchId: number }) => client.admin.facilitySubmission.downloadCsv(input.batchId),
  });
}

export function useSubmissionBatchesQuery(params: SubmissionBatchListParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.facilitySubmissionBatches(params),
    queryFn: () => client.admin.facilitySubmission.list(params),
  });
}

export function useSubmissionBatchDetailQuery(batchId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.facilitySubmissionBatchDetail(batchId),
    queryFn: () => client.admin.facilitySubmission.detail(batchId),
  });
}

export function useCompleteSubmissionBatchMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const invalidate = useSubmissionInvalidation();
  return useMutation({
    mutationFn: (input: { batchId: number }) => client.admin.facilitySubmission.complete(input.batchId),
    onSettled: () => {
      invalidate();
      // 완료는 포함 예약을 APPROVED→CONFIRMED 로 전이한다 — 검토 탭 큐·상세·summary 가 stale 예약을 보이지 않게
      // 교차 무효화(useAdminBookingInvalidation 이 제출 캐시를 무효화하는 것의 역방향 대칭, P2-14).
      // 취소는 예약 상태 불변(submitted 플래그만)이라 제출 캐시로 충분 — 불필요 invalidate 는 추가하지 않는다.
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilityBookingsAll });
    },
  });
}

export function useCancelSubmissionBatchMutation() {
  const client = useApiClient();
  const invalidate = useSubmissionInvalidation();
  return useMutation({
    mutationFn: (input: { batchId: number }) => client.admin.facilitySubmission.cancel(input.batchId),
    onSettled: invalidate,
  });
}
