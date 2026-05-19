import { APPLICATIONS } from '../../_constants/mock';
import { SectionHeader } from '../SectionHeader';
import { Icon } from '../Icons';

const STEPS = ['서류', '검토', '면접', '결과'] as const;

export function SectionApply() {
  return (
    <section
      data-section="apply"
      id="sec-apply"
      className="px-10 pt-10 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title="진행 중인 지원 · 3"
          hint="현재 지원서를 작성 중이거나 결과를 기다리는 동아리입니다."
          extra={
            <button type="button" className="btn btn-ghost btn-sm">
              <Icon.filter />
              필터
            </button>
          }
        />
        <div className="flex flex-col gap-3">
          {APPLICATIONS.map((app, index) => (
            <div
              key={index}
              className={[
                'relative bg-paper rounded-[18px] p-5',
                'grid grid-cols-[auto_1fr_360px_auto] gap-5 items-center',
                'cursor-pointer transition-[transform,box-shadow,border-color] duration-[180ms]',
                'hover:-translate-y-0.5 hover:shadow-2',
                app.hi ? 'border border-ink' : 'border border-line',
              ].join(' ')}
            >
              {app.hi && (
                <div className="absolute -top-[10px] left-5 px-2.5 py-0.5 rounded-full bg-ink text-white text-[11px] font-bold">
                  📌 다음 일정
                </div>
              )}

              <div
                className="w-14 h-14 rounded-md grid place-items-center text-[26px] font-mono font-bold"
                style={{
                  background: `linear-gradient(135deg, ${app.color}22 0%, ${app.color}11 100%)`,
                  color: app.color,
                }}
              >
                {app.icon}
              </div>

              <div>
                <div className="text-[11.5px] font-semibold text-charcoal-3 mb-0.5">{app.cat}</div>
                <h3 className="text-[19px] font-body text-ink-deep">{app.club}</h3>
                <div className="text-[12.5px] text-charcoal-2 mt-1">{app.note}</div>
              </div>

              <div>
                <div className="text-[11.5px] font-semibold text-charcoal-3 tracking-wide04 mb-2">
                  진행 상태
                </div>
                <div className="flex gap-1 mb-2">
                  {STEPS.map((stepLabel, stepIndex) => {
                    const done = stepIndex < app.current;
                    const isCurrent = stepIndex === app.current - 1;
                    return (
                      <div key={stepLabel} className="flex-1">
                        <div
                          className={[
                            'h-1 rounded-full mb-1',
                            done || isCurrent ? 'bg-ink' : 'bg-line',
                          ].join(' ')}
                        />
                        <div
                          className={[
                            'text-[11px]',
                            isCurrent
                              ? 'font-bold text-ink'
                              : done
                                ? 'font-medium text-charcoal-2'
                                : 'font-medium text-charcoal-3',
                          ].join(' ')}
                        >
                          {stepLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[12px] text-charcoal-3 font-mono">{app.date}</div>
              </div>

              <button
                type="button"
                className="btn btn-sm inline-flex items-center gap-1.5"
                style={
                  app.hi
                    ? { background: 'var(--ink, #1F4A36)', color: '#fff', border: 'none' }
                    : { background: 'var(--paper, #fff)', color: 'var(--ink, #1F4A36)', border: '1px solid var(--line, #E5E2DA)' }
                }
              >
                {app.action}
                <Icon.arrowRight />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
