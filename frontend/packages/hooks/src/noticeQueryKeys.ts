import type { NoticeCategory, NoticeVisibility } from '@duing/types';

type ListFilters = {
  category?: NoticeCategory;
  tags?: string[];
  keyword?: string;
  page: number;
  size: number;
};

type AdminListFilters = {
  category?: NoticeCategory;
  visibility?: NoticeVisibility;
  keyword?: string;
  includeExpired?: boolean;
  page: number;
  size: number;
};

export const noticeQueryKeys = {
  all: ['notices'] as const,
  list: (filters: ListFilters) => ['notices', 'list', filters] as const,
  detail: (noticeId: number) => ['notices', 'detail', noticeId] as const,
  adminList: (filters: AdminListFilters) => ['notices', 'admin', 'list', filters] as const,
  adminDetail: (noticeId: number) => ['notices', 'admin', 'detail', noticeId] as const,
};