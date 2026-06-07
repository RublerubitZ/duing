import type { ApplicationScope, ApplicantsFilters } from '@duing/types';

export const applicationQueryKeys = {
  all: ['applications'] as const,
  allMyLists: ['users', 'me', 'applications'] as const,
  myList: (scope: ApplicationScope = 'ALL') =>
    [...applicationQueryKeys.allMyLists, { scope }] as const,
  myDetail: (applicationId: number) =>
    [...applicationQueryKeys.allMyLists, applicationId] as const,
  applicantsAll: () => [...applicationQueryKeys.all, 'applicants'] as const,
  applicants: (recruitmentId: number, filters?: ApplicantsFilters) =>
    [...applicationQueryKeys.all, 'applicants', recruitmentId, filters ?? {}] as const,
  applicantDetail: (applicationId: number) =>
    [...applicationQueryKeys.all, 'applicantDetail', applicationId] as const,
  applicantNeighbors: (
    recruitmentId: number,
    applicationId: number,
    filters?: ApplicantsFilters,
  ) =>
    [
      ...applicationQueryKeys.all,
      'applicantNeighbors',
      recruitmentId,
      applicationId,
      filters ?? {},
    ] as const,
};
