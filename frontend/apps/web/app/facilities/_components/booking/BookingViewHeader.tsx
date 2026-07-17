'use client';

import { DAY_LEVEL_META } from '../../_lib/bookingCalendar';

export type CalendarView = 'month' | 'week';

type Props = {
  view: CalendarView;
  onChangeView: (view: CalendarView) => void;
  periodLabel: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
};

// 월간 범례 — 캘린더 히트맵 레벨(여유/보통/혼잡/마감) 재사용(§2).
const MONTH_LEGEND = (['HIGH', 'MID', 'LOW', 'FULL'] as const).map((level) => ({
  label: DAY_LEVEL_META[level].label,
  barClass: DAY_LEVEL_META[level].barClass,
}));

// 주간 범례(§2·§10.1) — 가능=sage, 예약됨=파스텔 대표 1색(확정 예약 블록), 기본 확보 시간=sky 점선 가이드 셀, 대기=warm.
// 예약됨은 파스텔 팔레트를 순환하지만 범례는 대표 1색(mint)으로 "확정 예약" 을 안내한다.
// 기본 확보 시간 스와치는 그리드 가이드 셀과 정합하도록 점선(border-dashed) + 연한 sky 로 표기한다(§10.1).
const WEEK_LEGEND = [
  { label: '가능', barClass: 'bg-sage-mist' },
  { label: '예약됨', barClass: 'bg-pastel-mint' },
  { label: '기본 확보 시간', barClass: 'border border-dashed border-sky-300 bg-sky-50' },
  { label: '대기', barClass: 'bg-warm/60' },
];

/**
 * 월↔주 뷰 전환의 단일 진입점(§2): [월|주] 세그먼트 토글 + 기간 라벨 + 이동 화살표 + 범례.
 * 월간/주간이 이 헤더를 공유하고, 라벨·화살표·범례만 view 에 따라 달라진다.
 */
export function BookingViewHeader({ view, onChangeView, periodLabel, onPrev, onNext, canPrev, canNext }: Props) {
  const legend = view === 'month' ? MONTH_LEGEND : WEEK_LEGEND;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {/* 세그먼트 토글 — 목업 FacViewToggle(회색 트레이 + 활성 흰 배경·그림자). 접근성은 tablist 유지. */}
        <div className="flex rounded-[10px] bg-graysoft p-[3px]" role="tablist" aria-label="월/주 보기 전환">
          {(['month', 'week'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={view === candidate}
              onClick={() => onChangeView(candidate)}
              className={`rounded-[8px] px-3 py-1 text-sm font-bold motion-safe:transition-colors ${
                view === candidate ? 'bg-paper text-ink-deep shadow-sm' : 'text-charcoal-3'
              }`}
            >
              {candidate === 'month' ? '월' : '주'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={view === 'month' ? '이전 달' : '이전 주'}
            className="btn btn-ghost px-2.5 py-1.5 text-base leading-none disabled:pointer-events-none disabled:opacity-40"
            onClick={onPrev}
            disabled={!canPrev}
          >
            ←
          </button>
          <h2 className="min-w-[7.5rem] text-center font-display text-lg text-ink-deep">{periodLabel}</h2>
          <button
            type="button"
            aria-label={view === 'month' ? '다음 달' : '다음 주'}
            className="btn btn-ghost px-2.5 py-1.5 text-base leading-none disabled:pointer-events-none disabled:opacity-40"
            onClick={onNext}
            disabled={!canNext}
          >
            →
          </button>
        </div>
      </div>
      <span className="flex flex-wrap items-center gap-3 text-[11px] text-charcoal-3">
        {legend.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-[2px] ${item.barClass}`} />
            {item.label}
          </span>
        ))}
      </span>
    </div>
  );
}
