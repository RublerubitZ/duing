import { Sparkle } from '@/components/duing/Sparkle';
import { ArrowRight, Check } from '@/components/duing/Icon';

type Notification = {
  id: number;
  title: string;
  time: string;
  unread: boolean;
};

type NotifyBellProps = {
  count: number;
};

function NotifyBell({ count }: NotifyBellProps) {
  return (
    <div
      className="relative w-[132px] h-[132px] grid place-items-center shrink-0"
      aria-label={`읽지 않은 알림 ${count}개`}
    >
      <Sparkle size={18} color="var(--ink)" className="absolute top-2.5 left-1.5 opacity-85" />
      <Sparkle size={12} color="var(--sage)" className="absolute top-[38px] left-0 opacity-85" />
      <Sparkle size={14} color="var(--ink)" className="absolute bottom-3 right-2 opacity-85" />
      <Sparkle size={10} color="var(--sage)" className="absolute top-1 right-4 opacity-85" />

      <svg
        className="animate-bell-sway"
        width="92"
        height="92"
        viewBox="0 0 24 24"
        fill="var(--ink)"
        aria-hidden
      >
        <path d="M12 2.5c-.7 0-1.3.6-1.3 1.3v.6A6.5 6.5 0 0 0 5.5 10.7v3.5c0 1.8-.7 3.4-1.9 4.6-.5.5-.2 1.3.5 1.3h15.8c.7 0 1-.8.5-1.3-1.2-1.2-1.9-2.8-1.9-4.6v-3.5A6.5 6.5 0 0 0 13.3 4.4v-.6c0-.7-.6-1.3-1.3-1.3z" />
        <path d="M9.5 21.2a2.5 2.5 0 0 0 5 0z" fill="var(--ink-deep)" />
      </svg>

      <div
        className="animate-badge-pulse absolute top-2 right-3.5 min-w-[30px] h-[30px] px-2 rounded-full bg-coral text-white grid place-items-center text-[13px] font-extrabold font-mono border-2 border-cream"
        style={{ boxShadow: '0 4px 12px rgba(217,119,87,0.45)' }}
      >
        {count}
      </div>
    </div>
  );
}

type NotifyPreviewCardProps = {
  notification: Notification;
};

function NotifyPreviewCard({ notification }: NotifyPreviewCardProps) {
  return (
    <div
      className="bg-paper border border-line rounded-[14px] px-[18px] py-3.5 grid items-center gap-3.5 cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-2 hover:border-ink"
      style={{ gridTemplateColumns: 'auto 1fr auto' }}
      role="button"
      tabIndex={0}
    >
      <span
        className="w-[9px] h-[9px] rounded-full bg-ink shrink-0"
        style={{ boxShadow: '0 0 0 4px rgba(31,74,54,0.12)' }}
      />
      <span className="text-[14px] font-bold text-ink-deep whitespace-nowrap overflow-hidden text-ellipsis">
        {notification.title}
      </span>
      <span className="text-[12px] text-charcoal-3 font-mono whitespace-nowrap shrink-0">
        {notification.time}
      </span>
    </div>
  );
}

type NotifyRowProps = {
  notification: Notification;
};

function NotifyRow({ notification }: NotifyRowProps) {
  return (
    <div
      className={`group relative grid items-center gap-4 px-6 py-[18px] cursor-pointer bg-paper border-b border-line last:border-b-0 transition-[background,padding] duration-150 hover:bg-sage-tint hover:pl-7 ${notification.unread ? 'is-unread' : ''}`}
      style={{ gridTemplateColumns: '1fr auto auto' }}
      role="button"
      tabIndex={0}
    >
      {/* left accent bar */}
      <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-ink opacity-0 transition-opacity duration-150 group-hover:opacity-100" />

      <div className={`text-[14.5px] leading-snug text-ink-deep min-w-0 ${notification.unread ? 'font-bold' : 'font-semibold'}`}>
        {notification.title}
      </div>
      <div className="text-[12.5px] text-charcoal-3 font-mono whitespace-nowrap">
        {notification.time}
      </div>
      <ArrowRight
        size={16}
        className="text-charcoal-3 transition-[color,transform] duration-150 group-hover:text-ink group-hover:translate-x-0.5"
      />
    </div>
  );
}

type Props = {
  notifications: Notification[];
};

export function SectionNotify({ notifications }: Props) {
  const unreadCount = notifications.filter((n) => n.unread).length;
  const previews = notifications.slice(0, 2);
  const rest = notifications.slice(2);

  return (
    <section
      data-section="notify"
      id="sec-notify"
      className="px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">

        {/* Hero */}
        <div
          data-section-title=""
          className="relative overflow-hidden rounded-[24px] px-8 py-7 grid items-center gap-7 bg-sage-tint border border-sage-soft"
          style={{ gridTemplateColumns: 'auto 1fr 360px' }}
        >
          {/* radial glow overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(120% 80% at 20% 0%, rgba(157,182,160,0.25) 0%, transparent 60%)' }}
          />

          <NotifyBell count={unreadCount} />

          <div className="relative z-[1]">
            <div className="text-[11px] font-bold text-ink tracking-[0.16em] mb-2">NOTIFICATIONS · LIVE</div>
            <h2 className="text-[26px] font-body font-bold text-ink-deep leading-snug mb-1.5">
              읽지 않은 알림이 <strong className="text-ink font-extrabold">{unreadCount}개</strong> 있어요
            </h2>
            <p className="text-[13px] text-charcoal-2 leading-snug">중요한 일정과 새로운 소식을 확인해보세요!</p>
          </div>

          <div className="relative z-[1] grid gap-2.5">
            {previews.map((notification) => (
              <NotifyPreviewCard key={notification.id} notification={notification} />
            ))}
          </div>
        </div>

        {/* List header */}
        <div className="flex items-center justify-between px-1 pb-3.5 mt-7">
          <div className="flex items-center gap-2 text-[14px] font-bold text-ink-deep">
            <Sparkle size={14} color="var(--ink)" />
            전체 알림
          </div>
          <div className="flex gap-1">
            <button type="button" className="btn btn-ghost btn-sm">
              <Check size={14} />
              모두 읽음
            </button>
            <button type="button" className="btn btn-ghost btn-sm">
              전체 보기
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="bg-paper border border-line rounded-[20px] overflow-hidden">
          {rest.map((notification) => (
            <NotifyRow key={notification.id} notification={notification} />
          ))}
        </div>

        {/* More button */}
        <div className="flex justify-center pt-[22px] pb-1">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-[22px] py-2.5 rounded-full bg-paper border border-line text-charcoal-2 text-[13px] font-semibold transition-[background,border-color,color] duration-150 hover:bg-sage-tint hover:border-ink hover:text-ink"
          >
            더 많은 알림 보기
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
