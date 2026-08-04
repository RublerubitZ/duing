import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminRecruitmentSearchParams, ForceCloseRecruitmentPayload } from '@duing/types';

import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

export function useAdminRecruitmentsQuery(params: AdminRecruitmentSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.recruitmentsList(params),
    queryFn: () => client.admin.recruitments.list(params),
  });
}

export function useAdminRecruitmentDetailQuery(recruitmentId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.recruitmentsDetail(recruitmentId),
    queryFn: () => client.admin.recruitments.detail(recruitmentId),
  });
}

/**
 * 강제 마감. 상세 키는 목록 키의 하위(prefix)라 recruitmentsAll 무효화 한 번이 목록과 상세를
 * 함께 되살린다 — 마감 후 상태 뱃지·마감 버튼이 즉시 서버 값으로 맞춰진다.
 */
export function useForceCloseRecruitmentMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recruitmentId,
      payload,
    }: {
      recruitmentId: number;
      payload: ForceCloseRecruitmentPayload;
    }) => client.admin.recruitments.forceClose(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.recruitmentsAll });
    },
  });
}
