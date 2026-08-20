import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { Notification, NotificationSource, PageResponse } from '@duing/types';
import { useApiClient } from './api-context';
import { notificationQueryKeys } from './notificationQueryKeys';

const NOTIFICATION_PAGE_SIZE = 20;

export function useUnreadCountQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: () => client.notifications.unreadCount(),
    refetchOnWindowFocus: true,
    enabled,
  });
}

export function useNotificationListQuery(unreadOnly: boolean, enabled = true) {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: notificationQueryKeys.list(unreadOnly),
    enabled,
    queryFn: ({ pageParam }) =>
      client.notifications.list(unreadOnly, pageParam, NOTIFICATION_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasNext ? lastPage.page + 1 : undefined,
  });
}

type NotificationPages = InfiniteData<PageResponse<Notification>>;
type ReadTarget = { source: NotificationSource; id: number } | 'ALL';
type ReadMutationContext = { snapshot: Array<[QueryKey, unknown]> };

// 읽음 처리는 성공이 거의 확실한 멱등 PATCH 라 응답을 기다리지 않고 캐시를 먼저 갱신한다
// (클릭 즉시 읽음 표시·배지 감소). 실패 시 onError 스냅샷 롤백, onSettled 무효화로 서버와 재수렴.
// BROADCAST 알림의 id 는 브로드캐스트 id 이므로 (source, id) 쌍으로 대상 알림을 찾는다.
function applyOptimisticRead(queryClient: QueryClient, target: ReadTarget) {
  const readAt = new Date().toISOString();
  let wasUnread = false;

  queryClient.setQueriesData<NotificationPages>(
    { queryKey: [...notificationQueryKeys.all, 'list'] },
    (pagesData) => {
      if (!pagesData) return pagesData;
      return {
        ...pagesData,
        pages: pagesData.pages.map((page) => ({
          ...page,
          content: page.content.map((notification) => {
            const matches =
              target === 'ALL' ||
              (notification.source === target.source && notification.id === target.id);
            if (!matches || notification.isRead) return notification;
            wasUnread = true;
            return { ...notification, isRead: true, readAt };
          }),
        })),
      };
    },
  );

  queryClient.setQueryData<{ count: number }>(notificationQueryKeys.unreadCount(), (current) => {
    if (!current) return current;
    if (target === 'ALL') return { count: 0 };
    return wasUnread ? { count: Math.max(0, current.count - 1) } : current;
  });
}

async function snapshotForRollback(queryClient: QueryClient): Promise<ReadMutationContext> {
  await queryClient.cancelQueries({ queryKey: notificationQueryKeys.all });
  return { snapshot: queryClient.getQueriesData({ queryKey: notificationQueryKeys.all }) };
}

function rollbackFromSnapshot(queryClient: QueryClient, context: ReadMutationContext | undefined) {
  context?.snapshot.forEach(([queryKey, data]) => {
    queryClient.setQueryData(queryKey, data);
  });
}

export function useNotificationReadAllMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.notifications.markAllRead(),
    onMutate: async () => {
      const context = await snapshotForRollback(queryClient);
      applyOptimisticRead(queryClient, 'ALL');
      return context;
    },
    onError: (_error, _variables, context) => {
      rollbackFromSnapshot(queryClient, context);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
}

export function useNotificationSourceAwareReadMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ source, id }: { source: NotificationSource; id: number }) => {
      if (source === 'BROADCAST') {
        return client.notifications.markBroadcastRead(id);
      }
      return client.notifications.markRead(id);
    },
    onMutate: async (target) => {
      const context = await snapshotForRollback(queryClient);
      applyOptimisticRead(queryClient, target);
      return context;
    },
    onError: (_error, _target, context) => {
      rollbackFromSnapshot(queryClient, context);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
}
