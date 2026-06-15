import type { AdminGlobalEventListParams, GlobalEventListParams } from '@duing/types';

export const globalEventKeys = {
  all: ['global-events'] as const,
  publicList: (params: GlobalEventListParams) =>
    [...globalEventKeys.all, 'public', 'list', params] as const,
  publicDetail: (eventId: number) =>
    [...globalEventKeys.all, 'public', 'detail', eventId] as const,
  adminList: (params: AdminGlobalEventListParams) =>
    [...globalEventKeys.all, 'admin', 'list', params] as const,
  adminDetail: (eventId: number) =>
    [...globalEventKeys.all, 'admin', 'detail', eventId] as const,
  categoryStats: () => [...globalEventKeys.all, 'admin', 'category-stats'] as const,
};
