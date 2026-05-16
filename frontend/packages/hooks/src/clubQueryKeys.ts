import type { ClubSearchParams } from '@duing/types';

export const clubQueryKeys = {
  all: ['clubs'] as const,
  list: (params: ClubSearchParams) => [...clubQueryKeys.all, params] as const,
  detail: (clubId: number) => [...clubQueryKeys.all, clubId] as const,
  photos: (clubId: number) => [...clubQueryKeys.all, clubId, 'photos'] as const,
  recruitments: (clubId: number) => [...clubQueryKeys.all, clubId, 'recruitments'] as const,
  managed: () => [...clubQueryKeys.all, 'managed'] as const,
};
