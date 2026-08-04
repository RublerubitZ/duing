import type {
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
};
