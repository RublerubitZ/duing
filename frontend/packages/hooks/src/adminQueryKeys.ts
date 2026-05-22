import type { AdminClubSearchParams, AdminReportSearchParams, AdminUserSearchParams } from '@duing/types';

export const adminQueryKeys = {
  all: ['admin'] as const,
  clubsAll: ['admin', 'clubs'] as const,
  clubsList: (params: AdminClubSearchParams) =>
    [...adminQueryKeys.clubsAll, 'list', params] as const,
  usersAll: ['admin', 'users'] as const,
  usersSearch: (params: AdminUserSearchParams) =>
    [...adminQueryKeys.usersAll, 'search', params] as const,
  reportsAll: ['admin', 'reports'] as const,
  reportsList: (params: AdminReportSearchParams) =>
    [...adminQueryKeys.reportsAll, 'list', params] as const,
  reportsDetail: (reportId: number) =>
    [...adminQueryKeys.reportsAll, 'detail', reportId] as const,
};
