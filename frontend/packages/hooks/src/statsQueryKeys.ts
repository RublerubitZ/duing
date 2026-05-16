export const statsQueryKeys = {
  byRecruitment: (recruitmentId: number) => ['stats', recruitmentId] as const,
  summary: (recruitmentId: number) =>
    [...statsQueryKeys.byRecruitment(recruitmentId), 'summary'] as const,
  daily: (recruitmentId: number) =>
    [...statsQueryKeys.byRecruitment(recruitmentId), 'daily'] as const,
  funnel: (recruitmentId: number) =>
    [...statsQueryKeys.byRecruitment(recruitmentId), 'funnel'] as const,
};