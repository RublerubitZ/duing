import type { NoticeCategory } from '@duing/types';

type ListFilters = {
  category?: NoticeCategory;
  tags?: string[];
  keyword?: string;
  page: number;
  size: number;
};

export const noticeQueryKeys = {
  all: ['notices'] as const,
  list: (filters: ListFilters) => ['notices', 'list', filters] as const,
  detail: (noticeId: number) => ['notices', 'detail', noticeId] as const,
};