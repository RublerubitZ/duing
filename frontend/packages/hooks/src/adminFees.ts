import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminFeeAuditLogSearchParams,
  AdminFeeBillSearchParams,
  AdminFeeClubSearchParams,
  AdminFeePaymentSearchParams,
  AdminFeePeriodParams,
  CreateFeeAuditCommentPayload,
  FeeAuditCommentKind,
  UpdateFeeAuditCommentPayload,
} from '@duing/types';

import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

// 목록성 조회는 검색어·필터·페이지가 바뀔 때마다 로딩으로 리셋되면 타이핑 중인 입력창까지 언마운트돼
// 포커스를 잃는다. 이전 목록을 유지한 채 갱신하고, 갱신 중이라는 신호는 화면에서 딤으로 준다.

export function useAdminFeeClubsQuery(params: AdminFeeClubSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesList(params),
    queryFn: () => client.admin.fees.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useAdminFeeDashboardQuery(params: AdminFeePeriodParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesDashboard(params),
    queryFn: () => client.admin.fees.dashboard(params),
  });
}

/**
 * 동아리 상세 KPI. 호출마다 재무 데이터 열람 이력이 감사 로그에 한 건씩 남으므로,
 * 탭 이동·포커스 복귀로 같은 화면이 재조회되며 로그가 부풀지 않게 stale 판정을 1분 뒤로 미룬다.
 */
export function useAdminFeeClubDetailQuery(clubId: number, params: AdminFeePeriodParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesDetail(clubId, params),
    queryFn: () => client.admin.fees.detail(clubId, params),
    staleTime: 60_000,
  });
}

export function useAdminFeePoliciesQuery(clubId: number, params: AdminFeePeriodParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesPolicies(clubId, params),
    queryFn: () => client.admin.fees.policies(clubId, params),
  });
}

export function useAdminFeeBillsQuery(clubId: number, params: AdminFeeBillSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesBills(clubId, params),
    queryFn: () => client.admin.fees.bills(clubId, params),
    placeholderData: keepPreviousData,
  });
}

export function useAdminFeePaymentsQuery(clubId: number, params: AdminFeePaymentSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesPayments(clubId, params),
    queryFn: () => client.admin.fees.payments(clubId, params),
    placeholderData: keepPreviousData,
  });
}

export function useAdminFeeAccountQuery(clubId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesAccount(clubId),
    queryFn: () => client.admin.fees.account(clubId),
  });
}

export function useAdminFeeAuditLogsQuery(clubId: number, params: AdminFeeAuditLogSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesAuditLogs(clubId, params),
    queryFn: () => client.admin.fees.auditLogs(clubId, params),
    placeholderData: keepPreviousData,
  });
}

export function useAdminFeeAnomaliesQuery(clubId: number, params: AdminFeePeriodParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesAnomalies(clubId, params),
    queryFn: () => client.admin.fees.anomalies(clubId, params),
  });
}

export function useAdminFeeAuditCommentsQuery(clubId: number, kind?: FeeAuditCommentKind) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.feesComments(clubId, kind),
    queryFn: () => client.admin.fees.comments(clubId, kind),
  });
}

/**
 * 의견·메모 쓰기 3종의 공통 무효화. kind 별 목록이 따로 캐시되므로 kind 자리를 뺀 접두사로 한 번에 되살리고,
 * 열린 의견 수를 세는 대시보드도 함께 무효화한다. feesAll 통째로 무효화하면 상세 조회가 재실행돼
 * 열람 감사 로그가 쓰기마다 한 건씩 늘어나므로 접두사를 좁게 잡는다.
 */
function useFeeAuditCommentInvalidation(clubId: number) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [...adminQueryKeys.feesAll, 'comments', clubId] });
    queryClient.invalidateQueries({ queryKey: [...adminQueryKeys.feesAll, 'dashboard'] });
  };
}

export function useCreateFeeAuditCommentMutation(clubId: number) {
  const client = useApiClient();
  const invalidateComments = useFeeAuditCommentInvalidation(clubId);
  return useMutation({
    mutationFn: (payload: CreateFeeAuditCommentPayload) =>
      client.admin.fees.createComment(clubId, payload),
    onSuccess: invalidateComments,
  });
}

export function useUpdateFeeAuditCommentMutation(clubId: number) {
  const client = useApiClient();
  const invalidateComments = useFeeAuditCommentInvalidation(clubId);
  return useMutation({
    mutationFn: ({
      commentId,
      payload,
    }: {
      commentId: number;
      payload: UpdateFeeAuditCommentPayload;
    }) => client.admin.fees.updateComment(clubId, commentId, payload),
    onSuccess: invalidateComments,
  });
}

export function useDeleteFeeAuditCommentMutation(clubId: number) {
  const client = useApiClient();
  const invalidateComments = useFeeAuditCommentInvalidation(clubId);
  return useMutation({
    mutationFn: (commentId: number) => client.admin.fees.deleteComment(clubId, commentId),
    onSuccess: invalidateComments,
  });
}
