import type {
  AdminClubMemberHistoryParams,
  AdminClubSearchParams,
  AdminRecertificationRoundSearchParams,
  AdminRecertificationRequestSearchParams,
  AdminReportSearchParams,
  AdminSuccessionSearchParams,
  AdminUserSearchParams,
  AdminPromotionRequestSearchParams,
  AdminPromotionSearchParams,
  CentralClubRecertificationStatusParams,
  AdminBookingQueueParams,
} from '@duing/types';

export const adminQueryKeys = {
  all: ['admin'] as const,
  clubsAll: ['admin', 'clubs'] as const,
  clubsList: (params: AdminClubSearchParams) =>
    [...adminQueryKeys.clubsAll, 'list', params] as const,
  clubsDetail: (clubId: number) =>
    [...adminQueryKeys.clubsAll, 'detail', clubId] as const,
  usersAll: ['admin', 'users'] as const,
  usersSearch: (params: AdminUserSearchParams) =>
    [...adminQueryKeys.usersAll, 'search', params] as const,
  reportsAll: ['admin', 'reports'] as const,
  reportsList: (params: AdminReportSearchParams) =>
    [...adminQueryKeys.reportsAll, 'list', params] as const,
  reportsDetail: (reportId: number) =>
    [...adminQueryKeys.reportsAll, 'detail', reportId] as const,
  leaderSuccessionAll: ['admin', 'leader-succession'] as const,
  leaderSuccessionList: (params: AdminSuccessionSearchParams) =>
    [...adminQueryKeys.leaderSuccessionAll, 'list', params] as const,
  leaderSuccessionDetail: (requestId: number) =>
    [...adminQueryKeys.leaderSuccessionAll, 'detail', requestId] as const,
  clubMemberHistory: (clubId: number, params: AdminClubMemberHistoryParams) =>
    ['admin', 'club-member-history', clubId, params] as const,
  recertificationRoundsAll: ['admin', 'recertification-rounds'] as const,
  recertificationRoundsList: (params: AdminRecertificationRoundSearchParams) =>
    [...adminQueryKeys.recertificationRoundsAll, 'list', params] as const,
  recertificationRequestsAll: ['admin', 'recertification-requests'] as const,
  recertificationRequestsList: (params: AdminRecertificationRequestSearchParams) =>
    [...adminQueryKeys.recertificationRequestsAll, 'list', params] as const,
  recertificationRequestsDetail: (requestId: number) =>
    [...adminQueryKeys.recertificationRequestsAll, 'detail', requestId] as const,
  centralClubRecertificationStatus: (params: CentralClubRecertificationStatusParams) =>
    ['admin', 'central-club-recertification-status', params] as const,
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
};
