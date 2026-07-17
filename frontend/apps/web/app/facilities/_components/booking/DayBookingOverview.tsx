'use client';

import type { BookingAvailabilitySlot, BookingDayAvailability, BookingOperatingNote } from '@duing/types';
import { bookingDateLabel } from '@/app/_lib/bookingDisplay';
import { type DayOverviewTimelineItem, dayOverviewTimeline, rangeLabel } from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
};

// 종류 → 상태 도트 색(§5.2): 예약됨(SCHOOL·INTERNAL) = charcoal-3, 승인 대기(PENDING) = warm,
// 운영 조각(OPERATING) = sage(예약 가능 구간).
const TIMELINE_DOT_CLASS: Record<DayOverviewTimelineItem['kind'], string> = {
  SCHOOL: 'bg-charcoal-3',
  INTERNAL: 'bg-charcoal-3',
  PENDING: 'bg-warm',
  OPERATING: 'bg-sage',
};

// AVAILABLE 슬롯이 운영 노트 구간에 완전히 속하면 운영 조각 행이 이미 담당 → "그 외" 집계서 제외(§5.2 이중 집계 금지).
function isWithinOperating(slot: BookingAvailabilitySlot, operatingNotes: BookingOperatingNote[]): boolean {
  return operatingNotes.some((note) => slot.start >= note.start && slot.end <= note.end);
}

/** 예약 건별 현황 카드(§4‴·§5) — 운영행을 예약 건으로 잘라 조각으로 함께 표시. 타임라인이 0건이면 미렌더. */
export function DayBookingOverview({ day }: Props) {
  const timeline = dayOverviewTimeline(day.slots, day.operatingNotes);
  // 타임라인(예약 건 + 운영 조각)이 0건일 때만 미렌더(§5.2) — 운영행만 있는 날도 통짜 조각 1행으로 뜬다.
  if (timeline.length === 0) return null;
  // 그 외 N = 운영 노트 구간 밖 AVAILABLE 만(운영 구간 내 AVAILABLE 은 운영 조각 행이 담당).
  const otherAvailableCount = day.slots.filter(
    (slot) => slot.status === 'AVAILABLE' && !isWithinOperating(slot, day.operatingNotes),
  ).length;
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <p className="text-[13px] font-bold text-ink">{bookingDateLabel(day.date)} 예약 현황</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {timeline.map((item, index) => (
          <li key={`${item.kind}-${item.start}-${item.end}-${index}`} className="flex items-center gap-2">
            <span className="w-[82px] font-mono text-xs text-charcoal-3">{rangeLabel(item)}</span>
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIMELINE_DOT_CLASS[item.kind]}`} />
            <span className="text-[13px] font-semibold text-ink">
              {item.label}
              {item.kind === 'OPERATING' ? <span className="ml-1 font-normal text-charcoal-3">(기본 확보)</span> : null}
            </span>
          </li>
        ))}
        {otherAvailableCount > 0 ? (
          <li className="mt-1 flex items-center gap-2 border-t border-dashed border-line pt-2">
            <span className="w-[82px] font-mono text-xs text-ink">그 외 시간</span>
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
            <span className="text-[13px] font-bold text-ink">예약 가능 · {otherAvailableCount}개 시간</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
