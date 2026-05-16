export const applicationQueryKeys = {
  all: ['applications'] as const,
  myList: () => ['users', 'me', 'applications'] as const,
  myDetail: (applicationId: number) =>
    [...applicationQueryKeys.myList(), applicationId] as const,
  applicants: (recruitmentId: number) =>
    [...applicationQueryKeys.all, 'applicants', recruitmentId] as const,
  applicantDetail: (applicationId: number) =>
    [...applicationQueryKeys.all, 'applicantDetail', applicationId] as const,
};
