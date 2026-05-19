import type { AdminClubSearchParams, AdminUserSearchParams } from '@duing/types';

export const adminQueryKeys = {
  all: ['admin'] as const,
  clubsAll: ['admin', 'clubs'] as const,
  clubsList: (params: AdminClubSearchParams) =>
    [...adminQueryKeys.clubsAll, 'list', params] as const,
  usersAll: ['admin', 'users'] as const,
  usersSearch: (params: AdminUserSearchParams) =>
    [...adminQueryKeys.usersAll, 'search', params] as const,
};
