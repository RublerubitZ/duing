'use client';

import type { BookingDayAvailability } from '@duing/types';
import { yearMonthLabel } from '../../_lib/facilityTimeline';
import { buildMonthCells, isWithinBookable } from '../../_lib/bookingCalendar';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  yearMonth: string;
  daysByIso: Map<string, BookingDayAvailability>;
  bookableFrom: string;
  bookableUntil: string;
  todayIso: string;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canPrev: boolean;
  canNext: boolean;
};

export function BookingCalendar({
  yearMonth, daysByIso, bookableFrom, bookableUntil, todayIso,
  selectedDate, onSelectDate, onPrevMonth, onNextMonth, canPrev, canNext,
}: Props) {
  const cells = buildMonthCells(yearMonth);
  return (
    <section className="rounded-lg border border-line bg-paper p-4 sm:p-5" aria-label="예약 캘린더">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="btn btn-ghost" onClick={onPrevMonth} disabled={!canPrev}>
          ← 이전 달
        </button>
        <h2 className="font-display text-lg text-ink-deep">{yearMonthLabel(yearMonth)}</h2>
        <button type="button" className="btn btn-ghost" onClick={onNextMonth} disabled={!canNext}>
          다음 달 →
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-charcoal-3">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return <div key={cell.iso} aria-hidden className="h-14 rounded-md" />;
          }
          const day = daysByIso.get(cell.iso);
          const withinRange = isWithinBookable(cell.iso, bookableFrom, bookableUntil);
          const isPast = day?.dayStatus === 'PAST' || cell.iso < todayIso;
          const isFull = day?.dayStatus === 'FULL';
          const selectable = withinRange && !isPast && day !== undefined;
          const selected = cell.iso === selectedDate;
          const isToday = cell.iso === todayIso;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={!selectable}
              onClick={() => onSelectDate(cell.iso)}
              aria-pressed={selected}
              aria-label={`${cell.day}일${isFull ? ' 마감' : ''}`}
              className={`flex h-14 flex-col items-center justify-center rounded-md border text-sm motion-safe:transition-colors ${
                selected
                  ? 'border-ink bg-ink text-cream'
                  : selectable
                    ? 'border-line bg-paper text-charcoal hover:border-sage'
                    : 'border-transparent bg-transparent text-charcoal-3 opacity-45'
              } ${isToday && !selected ? 'ring-1 ring-coral' : ''}`}
            >
              <span className="font-medium">{cell.day}</span>
              {selectable && (
                <span className={`text-[10px] ${selected ? 'text-cream/85' : isFull ? 'text-coral' : 'text-charcoal-3'}`}>
                  {isFull ? '마감' : `${day.availableSlotCount}칸`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
