import { ACTIVITY_STATS, ACTIVITY_TIMELINE } from '../../_constants/mock';
import { SectionHeader } from '../SectionHeader';
import { Icon } from '../Icons';

export function SectionActivity() {
  return (
    <section
      data-section="activity"
      id="sec-activity"
      className="px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title="내 활동"
          hint="2025년 2학기 활동 요약과 최근 참여 기록입니다."
        />

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {ACTIVITY_STATS.map((stat, index) => (
            <div
              key={index}
              className="bg-paper border border-line rounded-[18px] px-[22px] py-5 transition-[transform,box-shadow] duration-[180ms] hover:-translate-y-0.5 hover:shadow-2"
            >
              <div className="text-[11.5px] font-semibold text-charcoal-3 tracking-wide04 mb-2.5">
                {stat.label}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-display text-[34px] font-bold text-ink-deep">{stat.value}</span>
                <span className="text-[14px] text-charcoal-2 font-semibold">{stat.unit}</span>
              </div>
              <div className="text-[11.5px] text-charcoal-3 mt-1.5">{stat.hint}</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="bg-paper border border-line rounded-lg p-1">
          <div className="px-[22px] py-4 border-b border-line flex items-center justify-between">
            <div className="text-[14px] font-bold text-ink-deep">최근 참여 기록</div>
            <button type="button" className="btn btn-ghost btn-sm px-2.5 py-1">
              전체 보기
              <Icon.arrowRight />
            </button>
          </div>
          <div className="py-1">
            {ACTIVITY_TIMELINE.map((item, index) => (
              <div
                key={index}
                className={[
                  'grid grid-cols-[64px_auto_1fr_auto] gap-4 px-[22px] py-3.5 items-center',
                  index < ACTIVITY_TIMELINE.length - 1 ? 'border-b border-line' : '',
                ].join(' ')}
              >
                <div className="font-mono text-[12.5px] text-charcoal-3 font-semibold">
                  {item.date}
                </div>
                <span className="pill text-[10.5px]">{item.club}</span>
                <div>
                  <div className="text-[13.5px] font-semibold text-ink-deep">{item.title}</div>
                  <div className="text-[11.5px] text-charcoal-3 mt-0.5">{item.type}</div>
                </div>
                <div
                  className={[
                    'text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1',
                    item.attended
                      ? 'bg-sage-mist text-ink-deep'
                      : 'bg-graysoft text-charcoal-3',
                  ].join(' ')}
                >
                  {item.attended ? (
                    <>
                      <Icon.check className="w-3 h-3" />
                      참여
                    </>
                  ) : (
                    '기록'
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
