import type { ApplicationScope } from '@duing/types';

export const applicationQueryKeys = {
  all: ['applications'] as const,
  allMyLists: ['users', 'me', 'applications'] as const,
  myList: (scope: ApplicationScope = 'ALL') =>
    [...applicationQueryKeys.allMyLists, { scope }] as const,
  myDetail: (applicationId: number) =>
    [...applicationQueryKeys.allMyLists, applicationId] as const,
  applicants: (recruitmentId: number) =>
    [...applicationQueryKeys.all, 'applicants', recruitmentId] as const,
  applicantDetail: (applicationId: number) =>
    [...applicationQueryKeys.all, 'applicantDetail', applicationId] as const,
};
