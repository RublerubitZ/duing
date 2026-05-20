import { useQuery } from '@tanstack/react-query';
import type { NoticeCategory } from '@duing/types';
import { useApiClient } from './api-context';
import { noticeQueryKeys } from './noticeQueryKeys';

type ListParams = {
  category?: NoticeCategory;
  tags?: string[];
  keyword?: string;
  page: number;
  size: number;
};

export function useNoticeListQuery(params: ListParams, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: noticeQueryKeys.list(params),
    queryFn: () => client.notices.list(params),
    enabled,
    staleTime: 30_000,
  });
}

export function useNoticeDetailQuery(noticeId: number | null, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: noticeQueryKeys.detail(noticeId ?? -1),
    queryFn: () => {
      if (noticeId === null) throw new Error('noticeId is null but query is enabled');
      return client.notices.detail(noticeId);
    },
    enabled: enabled && noticeId !== null,
    staleTime: 30_000,
  });
}
