export const recruitmentQueryKeys = {
  all: ['recruitments'] as const,
  calendar: (yearMonth: string) => [...recruitmentQueryKeys.all, 'calendar', yearMonth] as const,
  detail: (recruitmentId: number) => [...recruitmentQueryKeys.all, recruitmentId] as const,
};