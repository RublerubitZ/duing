import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplicationScope,
  ApplicantsFilters,
  BulkUpdateApplicationStatusPayload,
  BulkUpdateApplicationStatusResult,
  SubmitApplicationPayload,
  UpdateApplicationStatusPayload,
  UpdateInterviewPayload,
  UpsertApplicationEvaluationPayload,
} from '@duing/types';
import { useAuthStore } from '@duing/stores';
import { useApiClient } from './api-context';
import { applicationQueryKeys } from './applicationQueryKeys';
import { statsQueryKeys } from './statsQueryKeys';

export function useSubmitApplicationMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitApplicationPayload) =>
      client.applications.submit(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationQueryKeys.allMyLists });
    },
  });
}

export function useMyApplicationsQuery(scope: ApplicationScope = 'ALL') {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: applicationQueryKeys.myList(scope),
    queryFn: () => client.users.myApplications(scope),
    enabled: status === 'authenticated',
  });
}

export function useMyApplicationDetailQuery(applicationId: number | undefined) {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey:
      applicationId !== undefined
        ? applicationQueryKeys.myDetail(applicationId)
        : ['users', 'me', 'applications', undefined],
    queryFn: () => {
      if (applicationId === undefined) {
        throw new Error('applicationId is required');
      }
      return client.applications.myDetail(applicationId);
    },
    enabled: status === 'authenticated' && applicationId !== undefined,
  });
}

export function useApplicantsQuery(
  recruitmentId: number | undefined,
  filters?: ApplicantsFilters,
) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      recruitmentId !== undefined
        ? applicationQueryKeys.applicants(recruitmentId, filters)
        : ['applications', 'applicants', undefined],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.applications.applicants(recruitmentId, filters);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useApplicantDetailQuery(applicationId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      applicationId !== undefined
        ? applicationQueryKeys.applicantDetail(applicationId)
        : ['applications', 'applicantDetail', undefined],
    queryFn: () => {
      if (applicationId === undefined) {
        throw new Error('applicationId is required');
      }
      return client.applications.detail(applicationId);
    },
    enabled: applicationId !== undefined,
  });
}

export function useUpdateApplicationStatusMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      payload,
    }: {
      applicationId: number;
      payload: UpdateApplicationStatusPayload;
    }) => client.applications.updateStatus(applicationId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicants(recruitmentId),
      });
      // 모달이 읽는 detail 캐시를 무효화하지 않으면 닫았다 다시 열 때 stale status 로
      // 전이 버튼이 재계산돼 BE 의 실제 상태와 불일치한 PATCH 가 나가 400 이 발생한다.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantDetail(variables.applicationId),
      });
      queryClient.invalidateQueries({
        queryKey: statsQueryKeys.byRecruitment(recruitmentId),
      });
    },
  });
}

export function useBulkUpdateApplicationStatusMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<BulkUpdateApplicationStatusResult, Error, BulkUpdateApplicationStatusPayload>({
    mutationFn: (payload) => client.applications.bulkUpdateStatus(payload),
    onSuccess: () => {
      // 일괄 변경은 어떤 applicationId 가 영향받았는지 individual detail 캐시까지 알 수 없으므로
      // 안전하게 목록·통계만 무효화한다. 사용자가 모달을 다시 열면 detail 은 fresh 로드된다.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicants(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: statsQueryKeys.byRecruitment(recruitmentId),
      });
    },
  });
}

export function useUpdateInterviewMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      payload,
    }: {
      applicationId: number;
      payload: UpdateInterviewPayload;
    }) => client.applications.updateInterview(applicationId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicants(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantDetail(variables.applicationId),
      });
      queryClient.invalidateQueries({
        queryKey: statsQueryKeys.byRecruitment(recruitmentId),
      });
    },
  });
}

export function useApplicantNeighborsQuery(
  recruitmentId: number,
  applicationId: number,
  filters?: ApplicantsFilters,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: applicationQueryKeys.applicantNeighbors(recruitmentId, applicationId, filters),
    queryFn: () =>
      client.applications.applicantNeighbors(recruitmentId, applicationId, filters),
    enabled: Number.isFinite(recruitmentId) && Number.isFinite(applicationId),
  });
}

export function useUpsertMyApplicationEvaluationMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      payload,
    }: {
      applicationId: number;
      payload: UpsertApplicationEvaluationPayload;
    }) => client.applications.upsertMyApplicationEvaluation(applicationId, payload),
    onSuccess: (_, { applicationId }) => {
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantDetail(applicationId),
      });
      // applicants 목록의 myScore 갱신을 위해 접두키로 무효화
      queryClient.invalidateQueries({ queryKey: ['applications', 'applicants'] });
    },
  });
}

export function useDeleteMyApplicationEvaluationMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: number) =>
      client.applications.deleteMyApplicationEvaluation(applicationId),
    onSuccess: (_, applicationId) => {
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantDetail(applicationId),
      });
      // applicants 목록의 myScore 갱신을 위해 접두키로 무효화
      queryClient.invalidateQueries({ queryKey: ['applications', 'applicants'] });
    },
  });
}