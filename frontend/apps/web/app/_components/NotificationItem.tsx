import type { LucideIcon } from 'lucide-react';
import {
  AlarmClock,
  Bell,
  CalendarCheck,
  CalendarClock,
  Clock,
  Megaphone,
  Sparkles,
} from 'lucide-react';
import type { Notification, NotificationType } from '@duing/types';
import { cn } from '@/app/_lib/cn';

type Props = {
  notification: Notification;
  onClick: (notification: Notification) => void;
};

type Visual = { label: string; Icon: LucideIcon; tone: string };

// 알림 종류별 배지 라벨 · lucide 아이콘 · 색조(아이콘 배경+배지: 토큰/10, 글자: 토큰).
const TYPE_VISUALS: Record<NotificationType, Visual> = {
  INTERVIEW_SCHEDULED: { label: '면접', Icon: CalendarCheck, tone: 'bg-ink/10 text-ink' },
  INTERVIEW_REMINDER: { label: '면접', Icon: Clock, tone: 'bg-ink/10 text-ink' },
  INTERVIEW_AVAILABILITY_REQUESTED: { label: '면접', Icon: CalendarClock, tone: 'bg-ink/10 text-ink' },
  RECRUITMENT_OPENED: { label: '모집', Icon: Sparkles, tone: 'bg-sky/10 text-sky' },
  RECRUITMENT_DEADLINE: { label: '마감', Icon: AlarmClock, tone: 'bg-coral/10 text-coral' },
  NOTICE_TARGETED: { label: '공지', Icon: Megaphone, tone: 'bg-warm/10 text-warm' },
};

const BROADCAST_VISUAL: Visual = { label: '공지', Icon: Megaphone, tone: 'bg-warm/10 text-warm' };
const DEFAULT_VISUAL: Visual = { label: '알림', Icon: Bell, tone: 'bg-sage-mist text-ink-deep' };

function resolveVisual(notification: Notification): Visual {
  if (notification.source === 'BROADCAST') return BROADCAST_VISUAL;
  if (notification.type) return TYPE_VISUALS[notification.type] ?? DEFAULT_VISUAL;
  return DEFAULT_VISUAL;
}

export function NotificationItem({ notification, onClick }: Props) {
  const { label, Icon, tone } = resolveVisual(notification);
  const timeLabel = formatRelativeTime(notification.createdAt);

  return (
    <button
      type="button"
      onClick={() => onClick(notification)}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors',
        notification.isRead
          ? 'border border-transparent hover:bg-cream-2/60'
          : 'border border-line bg-paper hover:bg-paper',
      )}
    >
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', tone)}>
        <Icon size={18} strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', tone)}>{label}</span>
          <span className="ml-auto text-[10.5px] text-charcoal-3">{timeLabel}</span>
        </div>
        <p className="line-clamp-2 text-[13.5px] font-bold leading-snug text-ink-deep">
          {notification.title}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-charcoal-2">{notification.body}</p>
      </div>
      {!notification.isRead && (
        <span className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full bg-coral" />
      )}
    </button>
  );
}

// "방금 · N분 전 · N시간 전 · N일 전 · M월 D일" — 최근일수록 상대 표기, 일주일 이상은 날짜.
function formatRelativeTime(createdAt: string): string {
  const created = new Date(createdAt);
  const diffMs = Date.now() - created.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  return `${created.getMonth() + 1}월 ${created.getDate()}일`;
}
