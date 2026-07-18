import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNoticePayload, NoticeCategory, NoticeSource, NoticeVisibility, UpdateNoticePayload } from '@duing/types';
import { useApiClient } from './api-context';
import { noticeQueryKeys } from './noticeQueryKeys';

type ListParams = {
  category?: NoticeCategory;
  tags?: string[];
  keyword?: string;
  source?: NoticeSource;
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
    // 카테고리·검색·페이지 변경 시 로딩 리셋 대신 이전 목록을 유지한 채 갱신한다.
    placeholderData: keepPreviousData,
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

type AdminListParams = {
  category?: NoticeCategory;
  visibility?: NoticeVisibility;
  keyword?: string;
  includeExpired?: boolean;
  page: number;
  size: number;
};

export function useAdminNoticeListQuery(params: AdminListParams, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: noticeQueryKeys.adminList(params),
    queryFn: () => client.admin.notices.list(params),
    enabled,
    staleTime: 15_000,
  });
}

export function useAdminNoticeDetailQuery(noticeId: number | null, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: noticeQueryKeys.adminDetail(noticeId ?? -1),
    queryFn: () => {
      if (noticeId === null) throw new Error('noticeId is null but query is enabled');
      return client.admin.notices.detail(noticeId);
    },
    enabled: enabled && noticeId !== null,
    staleTime: 15_000,
  });
}

export function useAdminNoticeCreateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateNoticePayload) => client.admin.notices.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noticeQueryKeys.all });
    },
  });
}

export function useAdminNoticeUpdateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noticeId, payload }: { noticeId: number; payload: UpdateNoticePayload }) =>
      client.admin.notices.update(noticeId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: noticeQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: noticeQueryKeys.adminDetail(variables.noticeId) });
    },
  });
}

export function useAdminNoticeDeleteMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: number) => client.admin.notices.remove(noticeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noticeQueryKeys.all });
    },
  });
}
