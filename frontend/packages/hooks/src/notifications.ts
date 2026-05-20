import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationSource } from '@duing/types';
import { useApiClient } from './api-context';
import { notificationQueryKeys } from './notificationQueryKeys';

const NOTIFICATION_PAGE_SIZE = 20;

export function useUnreadCountQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: () => client.notifications.unreadCount(),
    staleTime: 30_000,
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

export function useNotificationReadMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: number) =>
      client.notifications.markRead(notificationId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
}

export function useNotificationReadAllMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.notifications.markAllRead(),
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
}
