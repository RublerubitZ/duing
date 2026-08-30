'use client';

import type { BookingDayAvailability } from '@duing/types';
import {
  type DayUsageEntry,
  availableRuns,
  dayUsageEntries,
  periodDistribution,
  rangeLabel,
} from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
};

// 종류 → 상태 도트 색(§5.2): 예약됨(SCHOOL·INTERNAL) = charcoal-3, 승인 대기(PENDING) = warm,
// 기본 확보(OPERATING) = sage(비차단 — 예약 가능 구간, 스펙 §3 복원).
const USAGE_DOT_CLASS: Record<DayUsageEntry['kind'], string> = {
  SCHOOL: 'bg-charcoal-3',
  INTERNAL: 'bg-charcoal-3',
  PENDING: 'bg-warm',
  OPERATING: 'bg-sage',
};

/**
 * 통합 예약 현황 카드 — 우측 사이드바의 단일 카드. 날짜·총계는 상단 캘린더·헤더와 중복이라 두지 않고,
 * ① 사용 중(기본 확보 통짜·예약 완료·승인 대기) ② 예약 가능 구간(N타임) ③ 오전/오후/저녁 분포 순으로 쌓는다.
 * 예약 가능 구간은 하루 전체 시간축 기준(기본 확보 시간 포함 — 확보는 차단이 아니다) — availableRuns 참조.
 * 빈 섹션은 생략한다.
 */
export function DayBookingOverview({ day }: Props) {
  const usage = dayUsageEntries(day.slots, day.operatingNotes);
  const available = availableRuns(day.slots);
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <p className="text-[13px] font-bold text-ink">예약 현황</p>
      {usage.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {usage.map((entry, index) => (
            <li key={`${entry.kind}-${entry.start}-${entry.end}-${index}`} className="flex items-center gap-2">
              <span className="w-[82px] tabular-nums text-xs text-charcoal-3">{rangeLabel(entry)}</span>
              <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${USAGE_DOT_CLASS[entry.kind]}`} />
              <span className="text-[13px] font-semibold text-ink">
                {entry.label}
                {entry.kind === 'OPERATING' ? <span className="ml-1 font-normal text-charcoal-3">(기본 확보)</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <ul className={`mt-2 flex flex-col gap-1.5 ${usage.length > 0 ? 'pt-2' : ''}`}>
          {available.map((run) => (
            <li key={run.start} className="flex items-center gap-2">
              <span className="w-[82px] tabular-nums text-xs text-charcoal-3">{rangeLabel(run)}</span>
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
              <span className="text-[13px] font-bold text-ink">
                예약 가능 <span className="font-normal text-charcoal-3">({run.slotCount}타임)</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div
        className={`mt-2 space-y-1.5 ${usage.length > 0 || available.length > 0 ? 'pt-2' : ''}`}
      >
        {periodDistribution(day.slots).map((period) => (
          <div key={period.key} className="flex items-center gap-2 text-[11px]">
            <span className="w-7 font-bold text-ink">{period.label}</span>
            <span className="w-11 tabular-nums text-charcoal-3">{period.range}</span>
            <span aria-hidden className="flex flex-1 gap-[2px]">
              {Array.from({ length: period.total }).map((_, index) => (
                <span key={index} className={`h-1.5 flex-1 rounded-[2px] ${index < period.free ? 'bg-sage' : 'bg-line'}`} />
              ))}
            </span>
            <span className="w-8 text-right tabular-nums text-ink">{period.free}/{period.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
