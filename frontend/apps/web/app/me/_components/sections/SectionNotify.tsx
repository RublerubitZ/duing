import { Sparkle } from '../../../_components/Sparkle';
import { NOTIFICATION_ITEMS, type NotificationItem } from '../../_constants/mock';
import { Icon } from '../Icons';

function NotifyBell({ count }: { count: number }) {
  return (
    <div
      className="relative w-[132px] h-[132px] grid place-items-center shrink-0"
      aria-label={`읽지 않은 알림 ${count}개`}
    >
      <Sparkle size={18} color="var(--ink, #1F4A36)" className="absolute top-2.5 left-1.5 opacity-85" />
      <Sparkle size={12} color="var(--sage, #9DB6A0)" className="absolute top-[38px] left-0 opacity-85" />
      <Sparkle size={14} color="var(--ink, #1F4A36)" className="absolute bottom-3 right-2 opacity-85" />
      <Sparkle size={10} color="var(--sage, #9DB6A0)" className="absolute top-1 right-[18px] opacity-85" />

      <svg
        width="92"
        height="92"
        viewBox="0 0 24 24"
        fill="var(--ink, #1F4A36)"
        aria-hidden="true"
        style={{ transformOrigin: '50% 18%', animation: 'notifyBellSway 4.2s ease-in-out infinite' }}
      >
        <path d="M12 2.5c-.7 0-1.3.6-1.3 1.3v.6A6.5 6.5 0 0 0 5.5 10.7v3.5c0 1.8-.7 3.4-1.9 4.6-.5.5-.2 1.3.5 1.3h15.8c.7 0 1-.8.5-1.3-1.2-1.2-1.9-2.8-1.9-4.6v-3.5A6.5 6.5 0 0 0 13.3 4.4v-.6c0-.7-.6-1.3-1.3-1.3z" />
        <path d="M9.5 21.2a2.5 2.5 0 0 0 5 0z" fill="var(--ink-deep, #143025)" />
      </svg>

      <div
        className="absolute top-2 right-3.5 min-w-[30px] h-[30px] px-[9px] rounded-full bg-coral text-white grid place-items-center text-[13px] font-extrabold font-mono border-2 border-cream shadow-[0_4px_12px_rgba(217,119,87,0.45)]"
        style={{ animation: 'notifyBadgePulse 2.4s ease-in-out infinite' }}
      >
        {count}
      </div>
    </div>
  );
}

function NotifyPreviewCard({ item }: { item: NotificationItem }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="bg-paper border border-line rounded-md px-[18px] py-3.5 grid grid-cols-[auto_1fr_auto] gap-3.5 items-center cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-2 hover:border-ink"
    >
      <span className="w-[9px] h-[9px] rounded-full bg-ink shrink-0 shadow-[0_0_0_4px_rgba(31,74,54,0.12)]" />
      <span className="text-[14px] font-bold text-ink-deep truncate">{item.title}</span>
      <span className="text-[12px] text-charcoal-3 font-mono whitespace-nowrap shrink-0">{item.time}</span>
    </div>
  );
}

function NotifyRow({ item }: { item: NotificationItem }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        'group relative grid grid-cols-[1fr_auto_auto] gap-4 items-center px-6 py-[18px]',
        'bg-paper border-b border-line last:border-b-0 cursor-pointer',
        'transition-[background,padding] duration-[180ms]',
        'hover:bg-sage-tint hover:pl-7',
        item.unread ? '' : '',
      ].join(' ')}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-ink opacity-0 group-hover:opacity-100 transition-opacity duration-[180ms]" />
      <div className={['text-[14.5px] leading-snug min-w-0 text-ink-deep', item.unread ? 'font-bold' : 'font-semibold'].join(' ')}>
        {item.title}
      </div>
      <div className="text-[12.5px] text-charcoal-3 font-mono whitespace-nowrap">{item.time}</div>
      <Icon.arrowRight className="text-charcoal-3 w-4 h-4 transition-[color,transform] duration-[180ms] group-hover:text-ink group-hover:translate-x-0.5" />
    </div>
  );
}

export function SectionNotify() {
  const unreadCount = NOTIFICATION_ITEMS.filter((item) => item.unread).length;
  const previews = NOTIFICATION_ITEMS.slice(0, 2);
  const rest = NOTIFICATION_ITEMS.slice(2);

  return (
    <section
      data-section="notify"
      id="sec-notify"
      className="px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <style>{`
        @keyframes notifyBellSway {
          0%, 100% { transform: rotate(-6deg); }
          50%       { transform: rotate(6deg); }
        }
        @keyframes notifyBadgePulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
      `}</style>

      <div className="max-w-layout mx-auto">
        {/* Hero */}
        <div
          data-section-title=""
          className="relative overflow-hidden bg-sage-tint border border-sage-soft rounded-[24px] p-7 grid grid-cols-[auto_1fr_360px] gap-7 items-center"
        >
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_0%,rgba(157,182,160,0.25)_0%,transparent_60%)] pointer-events-none" />
          <NotifyBell count={unreadCount} />

          <div className="relative z-10">
            <div className="text-[11px] font-bold text-ink tracking-wide16 mb-2">
              NOTIFICATIONS · LIVE
            </div>
            <h2 className="text-[26px] font-body font-bold text-ink-deep leading-snug mb-1.5">
              읽지 않은 알림이 <strong className="text-ink font-extrabold">{unreadCount}개</strong> 있어요
            </h2>
            <p className="text-[13px] text-charcoal-2 leading-relaxed">
              중요한 일정과 새로운 소식을 확인해보세요!
            </p>
          </div>

          <div className="relative z-10 flex flex-col gap-2.5">
            {previews.map((item) => (
              <NotifyPreviewCard key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* List header */}
        <div className="flex items-center justify-between px-1 pt-2 pb-3.5 mt-7">
          <div className="flex items-center gap-2 text-[14px] font-bold text-ink-deep">
            <Sparkle size={14} color="var(--ink, #1F4A36)" />
            전체 알림
          </div>
          <div className="flex gap-1">
            <button type="button" className="btn btn-ghost btn-sm">
              <Icon.check />
              모두 읽음
            </button>
            <button type="button" className="btn btn-ghost btn-sm">
              전체 보기
              <Icon.arrowRight />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="bg-paper border border-line rounded-lg overflow-hidden">
          {rest.map((item) => (
            <NotifyRow key={item.id} item={item} />
          ))}
        </div>

        {/* More */}
        <div className="flex justify-center pt-[22px] pb-1">
          <button
            type="button"
            className="group inline-flex items-center gap-2 px-[22px] py-2.5 rounded-full bg-paper border border-line text-charcoal-2 text-[13px] font-semibold cursor-pointer transition-[background,border-color,color,transform] duration-[180ms] hover:bg-sage-tint hover:border-ink hover:text-ink hover:-translate-y-px"
          >
            더 많은 알림 보기
            <Icon.chev className="transition-transform duration-[180ms] group-hover:translate-y-0.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
