import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplicationScope,
  ApplicantsFilters,
  BulkUpdateApplicationStatusPayload,
  BulkUpdateApplicationStatusResult,
  SubmitApplicationPayload,
  UpdateApplicationStatusPayload,
  UpsertApplicationEvaluationPayload,
} from '@duing/types';
import type { DuingApiClient } from '@duing/api';
import { selectIsAuthenticated, useAuthStore } from '@duing/stores';
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

/**
 * 지원하기 클릭의 사전 확인과 /apply 진입 가드는 같은 판정을 라우트 전환 간격을 두고 두 번 묻는다.
 * 클릭이 남긴 판정을 이 시간 동안만 캐시로 넘겨 두 번째 요청을 없앤다 — 느린 전환도 덮을 만큼 길고,
 * 그 뒤의 재진입(뒤로가기·딥링크)은 다시 확인하게 만들 만큼 짧은 값.
 */
const ELIGIBILITY_HANDOFF_MS = 10_000;

/** 클릭 사전 확인과 진입 가드가 공유하는 단일 정의 — 키나 판정 모양이 갈라지면 중복 요청이 되살아난다. */
function eligibilityQueryOptions(client: DuingApiClient, recruitmentId: number) {
  return {
    queryKey: applicationQueryKeys.eligibility(recruitmentId),
    queryFn: async () => {
      await client.applications.checkEligibility(recruitmentId);
      return true;
    },
    // 부적격(4xx)은 기대 결과이므로 재시도하지 않는다.
    retry: false,
  };
}

/** 지원하기 버튼 클릭 시점의 사전 확인 — pending 상태로 중복 클릭을 막는다. */
export function useCheckEligibilityMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    // 클릭은 staleTime:0 으로 언제나 실제 확인을 보내되(캐시된 판정으로 넘기지 않는다), 결과를
    // eligibility 캐시에 남겨 곧바로 이어지는 /apply 진입 가드가 같은 요청을 다시 보내지 않게 한다.
    mutationFn: (recruitmentId: number) =>
      queryClient.fetchQuery({
        ...eligibilityQueryOptions(client, recruitmentId),
        staleTime: 0,
        gcTime: ELIGIBILITY_HANDOFF_MS,
      }),
  });
}

/** /apply 딥링크 가드용 — 부적격(4xx)은 기대 결과이므로 재시도하지 않는다. */
export function useApplicationEligibilityQuery(recruitmentId: number, enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    ...eligibilityQueryOptions(client, recruitmentId),
    enabled,
    // 클릭 사전 확인이 방금 남긴 판정만 물려받는 창 — 그 밖의 진입은 새로 확인한다.
    // 부적격 판정은 data 가 없어 언제나 stale 이므로 이 창을 타지 않는다(실패는 캐시로 재사용 불가).
    staleTime: ELIGIBILITY_HANDOFF_MS,
    // 루트 QueryClient 는 SPA 네비게이션 내내 살아 있어, 캐시가 남으면 재진입 시 status 가
    // 'success'|'error' 라 isLoading=false 가 되고 로딩 게이트가 재확인을 기다리지 않고 통과한다.
    // 그러면 그 사이 마감된 모집에도 지원 폼이 먼저 그려져 사용자가 입력을 시작해 버린다.
    // 이 화면이 스스로 만든 판정은 언마운트 즉시 버린다(gcTime:0). 클릭이 넘겨준 판정은
    // fetchQuery 가 세운 gcTime(=핸드오프 창)을 따르므로 그 창보다 오래 살아남지 못한다.
    gcTime: 0,
  });
}

export function useWithdrawApplicationMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: number) => client.applications.withdraw(applicationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationQueryKeys.allMyLists });
    },
  });
}

export function useMyApplicationsQuery(scope: ApplicationScope = 'ALL') {
  const client = useApiClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  return useQuery({
    queryKey: applicationQueryKeys.myList(scope),
    queryFn: () => client.users.myApplications(scope),
    enabled: isAuthenticated,
  });
}

export function useMyApplicationDetailQuery(applicationId: number | undefined) {
  const client = useApiClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
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
    enabled: isAuthenticated && applicationId !== undefined,
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
    // 필터가 바뀌어도 이전 목록을 유지한다 — 목록이 비었다 차오르면 스크롤·선택 맥락이 끊긴다.
    placeholderData: keepPreviousData,
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
      // 상태 변경 시 이웃 순서가 바뀔 수 있으므로 (필터 상태 기반 정렬) 모두 무효화한다.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantNeighborsAll(),
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
      // 일괄 상태 변경도 이웃 순서에 영향을 주므로 neighbors 캐시 전체 무효화.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantNeighborsAll(),
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
      queryClient.invalidateQueries({ queryKey: applicationQueryKeys.applicantsAll() });
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
      queryClient.invalidateQueries({ queryKey: applicationQueryKeys.applicantsAll() });
    },
  });
}
