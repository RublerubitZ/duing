export const facilityQueryKeys = {
  all: ['facilities'] as const,
  usage: (yearMonth?: string) =>
    [...facilityQueryKeys.all, 'usage', yearMonth ?? 'current'] as const,
  detail: (facilityId: number, yearMonth?: string) =>
    [...facilityQueryKeys.all, facilityId, yearMonth ?? 'current'] as const,
  availabilityAll: () => [...facilityQueryKeys.all, 'availability'] as const,
  availability: (facilityId: number, yearMonth?: string) =>
    [...facilityQueryKeys.availabilityAll(), facilityId, yearMonth ?? 'current'] as const,
  purposePresets: () => [...facilityQueryKeys.all, 'purpose-presets'] as const,
};
