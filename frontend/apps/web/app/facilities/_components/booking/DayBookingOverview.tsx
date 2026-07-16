'use client';

import type { BookingDayAvailability } from '@duing/types';
import { bookingDateLabel } from '@/app/_lib/bookingDisplay';
import { type DayBookingEntry, dayBookingEntries, rangeLabel } from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
};

// 종류 → 상태 도트 색(§4‴.2): 예약됨(SCHOOL·INTERNAL) = charcoal-3, 승인 대기(PENDING) = warm.
const ENTRY_DOT_CLASS: Record<DayBookingEntry['kind'], string> = {
  SCHOOL: 'bg-charcoal-3',
  INTERNAL: 'bg-charcoal-3',
  PENDING: 'bg-warm',
};

/** 예약 건별 현황 카드(§4‴) — 요약 카드와 시간 선택 리스트 사이. 예약 건이 0개면 미렌더. */
export function DayBookingOverview({ day }: Props) {
  const entries = dayBookingEntries(day.slots);
  // 예약 건이 0개면 카드 미렌더 — 그 외 행만 남으면 요약 카드 집계와 중복(§4‴.2).
  if (entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <p className="text-[13px] font-bold text-ink">{bookingDateLabel(day.date)} 예약 현황</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li key={entry.start} className="flex items-center gap-2">
            <span className="w-[82px] font-mono text-xs text-charcoal-3">{rangeLabel(entry)}</span>
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${ENTRY_DOT_CLASS[entry.kind]}`} />
            <span className="text-[13px] font-semibold text-ink">{entry.label}</span>
          </li>
        ))}
        <li className="mt-1 flex items-center gap-2 border-t border-dashed border-line pt-2">
          <span className="w-[82px] font-mono text-xs text-ink">그 외 시간</span>
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
          <span className="text-[13px] font-bold text-ink">예약 가능 · {day.availableSlotCount}개 시간</span>
        </li>
      </ul>
    </div>
  );
}
