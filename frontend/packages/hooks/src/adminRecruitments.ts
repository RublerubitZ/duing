import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminApplicantSearchParams,
  AdminRecruitmentSearchParams,
  ForceCloseRecruitmentPayload,
} from '@duing/types';

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

export function useAdminApplicantsQuery(
  recruitmentId: number,
  params: AdminApplicantSearchParams,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.recruitmentsApplications(recruitmentId, params),
    queryFn: () => client.admin.recruitments.applications(recruitmentId, params),
  });
}

/** 시트가 닫혀 있으면 대상이 없다 — 키 자리는 sentinel 로 채우고 조회 자체를 끈다. */
export function useAdminApplicationDetailQuery(applicationId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.applicationsDetail(applicationId ?? -1),
    queryFn: () => {
      if (applicationId === undefined) {
        throw new Error('applicationId is undefined but query is enabled');
      }
      return client.admin.recruitments.applicationDetail(applicationId);
    },
    enabled: applicationId !== undefined,
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
