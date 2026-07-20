import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSubmissionBatchPayload, SubmissionCandidatesParams } from '@duing/types';
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
