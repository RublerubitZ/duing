import { ArrowRight, Check } from '@/components/duing/Icon';

import { SectionHeader } from './SectionHeader';

type ActivityStat = {
  label: string;
  value: string;
  unit: string;
  hint: string;
};

type ActivityTimeline = {
  date: string;
  club: string;
  type: string;
  title: string;
  attended: boolean;
};

type Props = {
  stats: ActivityStat[];
  timeline: ActivityTimeline[];
};

export function SectionActivity({ stats, timeline }: Props) {
  return (
    <section
      data-section="activity"
      id="sec-activity"
      className="px-4 sm:px-6 md:px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title="내 활동"
          hint="2025년 2학기 활동 요약과 최근 참여 기록입니다."
        />

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-paper border border-line rounded-[18px] px-[22px] py-5 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-2"
            >
              <div className="text-[11.5px] font-semibold text-charcoal-3 tracking-[0.04em] mb-2.5">
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
        <div className="bg-paper border border-line rounded-[20px] p-1">
          <div className="px-[22px] py-4 border-b border-line flex items-center justify-between">
            <div className="text-[14px] font-bold text-ink-deep">최근 참여 기록</div>
            <button type="button" className="btn btn-ghost btn-sm py-1 px-2.5">
              전체 보기
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="py-1">
            {timeline.map((entry, index) => (
              <div
                key={`${entry.date}-${entry.title}`}
                className="grid items-center gap-4 px-[22px] py-3.5"
                style={{
                  gridTemplateColumns: '64px auto 1fr auto',
                  borderBottom: index < timeline.length - 1 ? '1px solid var(--gray-line)' : 'none',
                }}
              >
                <div className="font-mono text-[12.5px] text-charcoal-3 font-semibold">{entry.date}</div>
                <span className="pill text-[10.5px]">{entry.club}</span>
                <div>
                  <div className="text-[13.5px] font-semibold text-ink-deep">{entry.title}</div>
                  <div className="text-[11.5px] text-charcoal-3 mt-0.5">{entry.type}</div>
                </div>
                <div
                  className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: entry.attended ? 'var(--sage-mist)' : 'var(--gray-soft)',
                    color: entry.attended ? 'var(--ink-deep)' : 'var(--charcoal-3)',
                  }}
                >
                  {entry.attended ? (
                    <>
                      <Check size={12} />
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
