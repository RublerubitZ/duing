'use client';

import type { BookingDayAvailability } from '@duing/types';
import { yearMonthLabel } from '../../_lib/facilityTimeline';
import { DAY_LEVEL_META, TOTAL_SLOTS, buildMonthCells, dayLevelOf, isWithinBookable } from '../../_lib/bookingCalendar';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  yearMonth: string;
  daysByIso: Map<string, BookingDayAvailability>;
  bookableFrom: string;
  bookableUntil: string;
  todayIso: string;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  onOutOfWindowSelect: (iso: string) => void;
  windowLabel: string | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canPrev: boolean;
  canNext: boolean;
};

export function BookingCalendar({
  yearMonth, daysByIso, bookableFrom, bookableUntil, todayIso,
  selectedDate, onSelectDate, onOutOfWindowSelect, windowLabel,
  onPrevMonth, onNextMonth, canPrev, canNext,
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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {windowLabel && (
          <span className="rounded-full bg-sage-mist px-3 py-1 text-xs font-bold text-ink">
            예약 가능 기간 {windowLabel}
          </span>
        )}
        <span className="flex gap-3 text-[11px] text-charcoal-3">
          {(['HIGH', 'MID', 'LOW', 'FULL'] as const).map((level) => (
            <span key={level} className="inline-flex items-center gap-1">
              <span aria-hidden className={`h-2 w-2 rounded-[2px] ${DAY_LEVEL_META[level].barClass}`} />
              {DAY_LEVEL_META[level].label}
            </span>
          ))}
        </span>
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
          const isPastOrUnknown = day === undefined || day.dayStatus === 'PAST' || cell.iso < todayIso;
          const outOfWindow = !withinRange && !isPastOrUnknown;
          const selectable = withinRange && !isPastOrUnknown;
          const selected = cell.iso === selectedDate;
          const isToday = cell.iso === todayIso;
          const level = selectable && day ? dayLevelOf(day.availableSlotCount) : null;
          const levelMeta = level !== null ? DAY_LEVEL_META[level] : null;
          const ariaLabel = levelMeta !== null
            ? `${cell.day}일 ${levelMeta.label}`
            : outOfWindow
              ? `${cell.day}일 예약 기간 아님`
              : `${cell.day}일`;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={!selectable && !outOfWindow}
              aria-disabled={outOfWindow || undefined}
              onClick={() => (outOfWindow ? onOutOfWindowSelect(cell.iso) : onSelectDate(cell.iso))}
              aria-pressed={selected}
              aria-label={ariaLabel}
              className={`flex h-14 flex-col items-center justify-center rounded-md border text-sm motion-safe:transition-colors ${
                selected
                  ? 'border-ink bg-ink text-cream'
                  : selectable
                    ? 'border-line bg-paper text-charcoal hover:border-sage'
                    : 'border-transparent bg-transparent text-charcoal-3 opacity-45'
              } ${isToday && !selected ? 'ring-1 ring-coral' : ''}`}
            >
              <span className="font-medium">{cell.day}</span>
              {selectable && day && levelMeta && (
                <>
                  <span aria-hidden className="mt-auto flex w-full gap-[1.5px] px-1">
                    {Array.from({ length: 8 }).map((_, barIndex) => {
                      const filled = barIndex < Math.round((day.availableSlotCount / TOTAL_SLOTS) * 8);
                      return (
                        <span
                          key={barIndex}
                          className={`h-1 flex-1 rounded-[1px] ${
                            filled ? (selected ? 'bg-sage' : levelMeta.barClass) : selected ? 'bg-cream/30' : 'bg-graysoft'
                          }`}
                        />
                      );
                    })}
                  </span>
                  <span className={`text-[10px] font-bold ${selected ? 'text-cream/85' : levelMeta.textClass}`}>
                    {levelMeta.label}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
