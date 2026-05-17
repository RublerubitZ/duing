export const notificationQueryKeys = {
  all: ['notifications'] as const,
  list: (unreadOnly: boolean) => [...notificationQueryKeys.all, 'list', { unreadOnly }] as const,
  unreadCount: () => [...notificationQueryKeys.all, 'unread-count'] as const,
};
