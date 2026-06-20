import type { Notification } from '@duing/types';

type Props = {
  notification: Notification;
  onClick: (notification: Notification) => void;
};

export function NotificationItem({ notification, onClick }: Props) {
  const timeLabel = formatTime(notification.createdAt);

  return (
    <button
      type="button"
      onClick={() => onClick(notification)}
      className={`flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left transition hover:bg-slate-50 ${!notification.isRead ? 'bg-rose-50/40' : ''}`}
    >
      <span
        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${!notification.isRead ? 'bg-rose-500' : 'bg-transparent'}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {notification.source === 'BROADCAST' && (
            <span className="shrink-0 rounded-full bg-graysoft px-1.5 py-0.5 text-[10.5px] font-semibold text-charcoal-2">
              공지
            </span>
          )}
          <p className="min-w-0 truncate text-sm font-medium text-ink">{notification.title}</p>
        </div>
        <p className="mt-0.5 truncate text-xs text-charcoal-3">{notification.body}</p>
      </div>
      <span className="shrink-0 text-xs text-charcoal-3">{timeLabel}</span>
    </button>
  );
}

function formatTime(createdAt: string): string {
  const created = new Date(createdAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (created >= today) {
    const hours = String(created.getHours()).padStart(2, '0');
    const minutes = String(created.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  const month = String(created.getMonth() + 1).padStart(2, '0');
  const day = String(created.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}
