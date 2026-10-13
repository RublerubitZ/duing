import type { LucideIcon } from 'lucide-react';
import {
  AlarmClock,
  BadgeCheck,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarSync,
  CalendarX,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  Clock,
  FileClock,
  Hourglass,
  Inbox,
  Megaphone,
  MessageSquarePlus,
  MessageSquareReply,
  MessageSquareX,
  Receipt,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { formatRelativeTime } from '@duing/hooks/datetime';
import type { Notification, NotificationType } from '@duing/types';
import { cn } from '@/app/_lib/cn';

type Props = {
  notification: Notification;
  onClick: (notification: Notification) => void;
};

type Visual = { label: string; Icon: LucideIcon; tone: string };

// 분야 색조 — 아이콘 배경·배지 배경은 토큰/10, 글자·아이콘은 같은 색상의 deep(흰·크림 바탕에서 AA 4.5:1).
// 주의가 필요한 소식(취소·거절·충돌·연체·기한 임박·미처리)은 분야와 무관하게 attention(코랄).
const TONE = {
  interview: 'bg-ink/10 text-ink',
  recruitment: 'bg-sky/10 text-sky-deep',
  attention: 'bg-coral/10 text-coral-deep',
  notice: 'bg-warm/10 text-warm-deep',
  fee: 'bg-pastel-mint-accent/10 text-pastel-mint-deep',
  inquiry: 'bg-pastel-lavender-accent/10 text-pastel-lavender-deep',
  facility: 'bg-pastel-beige-accent/10 text-pastel-beige-deep',
} as const;

// 알림 종류별 배지 라벨(분야) · lucide 아이콘(사건) · 색조.
const TYPE_VISUALS: Record<NotificationType, Visual> = {
  INTERVIEW_SCHEDULED: { label: '면접', Icon: CalendarCheck, tone: TONE.interview },
  INTERVIEW_REMINDER: { label: '면접', Icon: Clock, tone: TONE.interview },
  INTERVIEW_AVAILABILITY_REQUESTED: { label: '면접', Icon: CalendarClock, tone: TONE.interview },
  INTERVIEW_UPDATED: { label: '면접', Icon: CalendarSync, tone: TONE.interview },
  INTERVIEW_CANCELLED: { label: '면접', Icon: CalendarX, tone: TONE.attention },
  RECRUITMENT_OPENED: { label: '모집', Icon: Sparkles, tone: TONE.recruitment },
  RECRUITMENT_DEADLINE: { label: '마감', Icon: AlarmClock, tone: TONE.attention },
  EXTERNAL_RECRUITMENT_STILL_OPEN: { label: '모집', Icon: ClipboardCheck, tone: TONE.recruitment },
  APPLICATION_RECEIVED: { label: '지원서', Icon: Inbox, tone: TONE.recruitment },
  APPLICATION_PENDING_REMINDER: { label: '지원서', Icon: FileClock, tone: TONE.attention },
  NOTICE_TARGETED: { label: '공지', Icon: Megaphone, tone: TONE.notice },
  FEE_BILL_ISSUED: { label: '회비', Icon: Receipt, tone: TONE.fee },
  FEE_BILL_DUE_SOON: { label: '회비', Icon: Hourglass, tone: TONE.attention },
  FEE_BILL_OVERDUE: { label: '회비', Icon: CircleAlert, tone: TONE.attention },
  FEE_PAID_CONFIRMED: { label: '회비', Icon: CircleCheck, tone: TONE.fee },
  FEE_PARTIAL_PAYMENT_CONFIRMED: { label: '회비', Icon: CircleDashed, tone: TONE.fee },
  FEDERATION_INQUIRY_RECEIVED: { label: '문의', Icon: MessageSquarePlus, tone: TONE.inquiry },
  FEDERATION_INQUIRY_ANSWERED: { label: '문의', Icon: MessageSquareReply, tone: TONE.inquiry },
  FEDERATION_INQUIRY_CLOSED: { label: '문의', Icon: MessageSquareX, tone: TONE.inquiry },
  FACILITY_BOOKING_SUBMITTED: { label: '시설', Icon: CalendarPlus, tone: TONE.facility },
  FACILITY_BOOKING_APPROVED: { label: '시설', Icon: CircleCheck, tone: TONE.facility },
  FACILITY_BOOKING_CONFIRMED: { label: '시설', Icon: BadgeCheck, tone: TONE.facility },
  FACILITY_BOOKING_REJECTED: { label: '시설', Icon: CircleX, tone: TONE.attention },
  FACILITY_BOOKING_CONFLICT: { label: '시설', Icon: TriangleAlert, tone: TONE.attention },
  FACILITY_BOOKING_CANCELLED: { label: '시설', Icon: CalendarX, tone: TONE.attention },
};

const BROADCAST_VISUAL: Visual = { label: '공지', Icon: Megaphone, tone: TONE.notice };
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
