import type {
  AdminApplicantSearchParams,
  AdminClubMemberHistoryParams,
  AdminClubSearchParams,
  AdminRecruitmentSearchParams,
  AdminReportSearchParams,
  AdminSuccessionSearchParams,
  AdminUserSearchParams,
  AdminPromotionRequestSearchParams,
  AdminPromotionSearchParams,
  AdminBookingQueueParams,
  SubmissionCandidatesParams,
  SubmissionBatchListParams,
  AdminFeeClubSearchParams,
  AdminFeePeriodParams,
  AdminFeeBillSearchParams,
  AdminFeePaymentSearchParams,
  AdminFeeAuditLogSearchParams,
  FeeAuditCommentKind,
} from '@duing/types';

export const adminQueryKeys = {
  all: ['admin'] as const,
  // 사이드바 뱃지 — 각 도메인 처리 뮤테이션이 성공하면 이 키만 무효화해 뱃지를 즉시 줄인다.
  pendingCounts: () => ['admin', 'pending-counts'] as const,
  clubsAll: ['admin', 'clubs'] as const,
  clubsList: (params: AdminClubSearchParams) =>
    [...adminQueryKeys.clubsAll, 'list', params] as const,
  clubsDetail: (clubId: number) =>
    [...adminQueryKeys.clubsAll, 'detail', clubId] as const,
  clubMembers: (clubId: number) =>
    [...adminQueryKeys.clubsAll, 'members', clubId] as const,
  usersAll: ['admin', 'users'] as const,
  usersSearch: (params: AdminUserSearchParams) =>
    [...adminQueryKeys.usersAll, 'search', params] as const,
  usersDetail: (userId: number) =>
    [...adminQueryKeys.usersAll, 'detail', userId] as const,
  reportsAll: ['admin', 'reports'] as const,
  reportsList: (params: AdminReportSearchParams) =>
    [...adminQueryKeys.reportsAll, 'list', params] as const,
  reportsDetail: (reportId: number) =>
    [...adminQueryKeys.reportsAll, 'detail', reportId] as const,
  recruitmentsAll: ['admin', 'recruitments'] as const,
  recruitmentsList: (params: AdminRecruitmentSearchParams) =>
    [...adminQueryKeys.recruitmentsAll, 'list', params] as const,
  recruitmentsDetail: (recruitmentId: number) =>
    [...adminQueryKeys.recruitmentsAll, 'detail', recruitmentId] as const,
  recruitmentsApplications: (recruitmentId: number, params: AdminApplicantSearchParams) =>
    [...adminQueryKeys.recruitmentsAll, 'applications', recruitmentId, params] as const,
  // 지원서 상세도 모집 접두사 아래에 둔다 — 강제 마감 뒤 한 번의 무효화로 함께 되살아난다.
  applicationsDetail: (applicationId: number) =>
    [...adminQueryKeys.recruitmentsAll, 'application-detail', applicationId] as const,
  leaderSuccessionAll: ['admin', 'leader-succession'] as const,
  leaderSuccessionList: (params: AdminSuccessionSearchParams) =>
    [...adminQueryKeys.leaderSuccessionAll, 'list', params] as const,
  leaderSuccessionDetail: (requestId: number) =>
    [...adminQueryKeys.leaderSuccessionAll, 'detail', requestId] as const,
  clubMemberHistory: (clubId: number, params: AdminClubMemberHistoryParams) =>
    ['admin', 'club-member-history', clubId, params] as const,
  promotionRequestsAll: ['admin', 'promotion-requests'] as const,
  promotionRequestsList: (params: AdminPromotionRequestSearchParams) =>
    [...adminQueryKeys.promotionRequestsAll, 'list', params] as const,
  promotionRequestsDetail: (requestId: number) =>
    [...adminQueryKeys.promotionRequestsAll, 'detail', requestId] as const,
  promotionsAll: ['admin', 'promotions'] as const,
  promotionsList: (params: AdminPromotionSearchParams) =>
    [...adminQueryKeys.promotionsAll, 'list', params] as const,
  promotionsDetail: (promotionId: number) =>
    [...adminQueryKeys.promotionsAll, 'detail', promotionId] as const,
  facilityBookingsAll: ['admin', 'facility-bookings'] as const,
  facilityBookingQueue: (params: AdminBookingQueueParams) =>
    [...adminQueryKeys.facilityBookingsAll, 'queue', params] as const,
  facilityBookingDetail: (bookingId: number) =>
    [...adminQueryKeys.facilityBookingsAll, 'detail', bookingId] as const,
  facilityBookingSummary: () => [...adminQueryKeys.facilityBookingsAll, 'summary'] as const,
  facilitySubmissionAll: ['admin', 'facility-submission'] as const,
  facilitySubmissionCandidates: (params: SubmissionCandidatesParams) =>
    [...adminQueryKeys.facilitySubmissionAll, 'candidates', params] as const,
  facilitySubmissionBatches: (params: SubmissionBatchListParams) =>
    [...adminQueryKeys.facilitySubmissionAll, 'batches', params] as const,
  facilitySubmissionBatchDetail: (batchId: number) =>
    [...adminQueryKeys.facilitySubmissionAll, 'batch-detail', batchId] as const,
  // 회비 감사. 상세(detail) 조회는 호출마다 열람 감사 이벤트를 남기므로 feesAll 통째 무효화는 하지 않는다 —
  // 의견 작성 후에는 comments·dashboard 접두사만 골라 무효화한다.
  feesAll: ['admin', 'fees'] as const,
  feesList: (params: AdminFeeClubSearchParams) =>
    [...adminQueryKeys.feesAll, 'list', params] as const,
  feesDashboard: (params: AdminFeePeriodParams) =>
    [...adminQueryKeys.feesAll, 'dashboard', params] as const,
  feesDetail: (clubId: number, params: AdminFeePeriodParams) =>
    [...adminQueryKeys.feesAll, 'detail', clubId, params] as const,
  feesPolicies: (clubId: number, params: AdminFeePeriodParams) =>
    [...adminQueryKeys.feesAll, 'policies', clubId, params] as const,
  feesBills: (clubId: number, params: AdminFeeBillSearchParams) =>
    [...adminQueryKeys.feesAll, 'bills', clubId, params] as const,
  feesPayments: (clubId: number, params: AdminFeePaymentSearchParams) =>
    [...adminQueryKeys.feesAll, 'payments', clubId, params] as const,
  feesAccount: (clubId: number) => [...adminQueryKeys.feesAll, 'account', clubId] as const,
  feesAuditLogs: (clubId: number, params: AdminFeeAuditLogSearchParams) =>
    [...adminQueryKeys.feesAll, 'audit-logs', clubId, params] as const,
  feesAnomalies: (clubId: number, params: AdminFeePeriodParams) =>
    [...adminQueryKeys.feesAll, 'anomalies', clubId, params] as const,
  // kind 별 목록이 따로 캐시되므로 무효화는 kind 자리 앞까지(clubId)를 접두사로 잡는다.
  feesComments: (clubId: number, kind?: FeeAuditCommentKind) =>
    [...adminQueryKeys.feesAll, 'comments', clubId, kind ?? 'ALL'] as const,
};
