export const statsQueryKeys = {
  all: ['stats'] as const,
  byRecruitment: (recruitmentId: number) => [...statsQueryKeys.all, recruitmentId] as const,
  summary: (recruitmentId: number) =>
    [...statsQueryKeys.byRecruitment(recruitmentId), 'summary'] as const,
  daily: (recruitmentId: number) =>
    [...statsQueryKeys.byRecruitment(recruitmentId), 'daily'] as const,
  funnel: (recruitmentId: number) =>
    [...statsQueryKeys.byRecruitment(recruitmentId), 'funnel'] as const,
};