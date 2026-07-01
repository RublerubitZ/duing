export const facilityQueryKeys = {
  all: ['facilities'] as const,
  usage: (yearMonth?: string) =>
    [...facilityQueryKeys.all, 'usage', yearMonth ?? 'current'] as const,
  detail: (facilityId: number, yearMonth?: string) =>
    [...facilityQueryKeys.all, facilityId, yearMonth ?? 'current'] as const,
};
