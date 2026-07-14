'use client';

import type { BookingDayAvailability } from '@duing/types';
import { yearMonthLabel } from '../../_lib/facilityTimeline';
import { DAY_LEVEL_META, TOTAL_SLOTS, buildMonthCells, dayLevelOf, isWithinBookable } from '../../_lib/bookingCalendar';

// 월요일 시작 — buildMonthCells 와 정렬. 토·일(index 5·6)은 charcoal-3 로 약하게 구분.
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="font-display text-lg text-ink-deep">{yearMonthLabel(yearMonth)}</h2>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="이전 달"
              className="btn btn-ghost px-2.5 py-1.5 text-base leading-none disabled:pointer-events-none disabled:opacity-40"
              onClick={onPrevMonth}
              disabled={!canPrev}
            >
              ←
            </button>
            <button
              type="button"
              aria-label="다음 달"
              className="btn btn-ghost px-2.5 py-1.5 text-base leading-none disabled:pointer-events-none disabled:opacity-40"
              onClick={onNextMonth}
              disabled={!canNext}
            >
              →
            </button>
          </div>
        </div>
        <span className="flex flex-wrap items-center gap-3 text-[11px] text-charcoal-3">
          {(['HIGH', 'MID', 'LOW', 'FULL'] as const).map((level) => (
            <span key={level} className="inline-flex items-center gap-1">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-[2px] ${DAY_LEVEL_META[level].barClass}`} />
              {DAY_LEVEL_META[level].label}
            </span>
          ))}
        </span>
      </div>
      {windowLabel && (
        <div className="mb-2">
          <span className="inline-flex rounded-full bg-sage-mist px-3 py-1 text-xs font-bold text-ink">
            예약 가능 기간 {windowLabel}
          </span>
        </div>
      )}
      <div className="grid grid-cols-7 gap-2 text-center">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={label}
            className={`py-1 text-[12.5px] font-bold ${index >= 5 ? 'text-charcoal-3' : 'text-charcoal-2'}`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return <div key={cell.iso} aria-hidden className="min-h-[56px] sm:min-h-[78px]" />;
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
          const ariaLabel = selectable && day && levelMeta
            ? `${cell.day}일 ${levelMeta.label}, 남은 ${day.availableSlotCount}칸`
            : outOfWindow
              ? `${cell.day}일 예약 기간 아님`
              : `${cell.day}일`;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={isPastOrUnknown}
              aria-disabled={outOfWindow || undefined}
              onClick={
                selectable
                  ? () => onSelectDate(cell.iso)
                  : outOfWindow
                    ? () => onOutOfWindowSelect(cell.iso)
                    : undefined
              }
              aria-pressed={selected}
              aria-label={ariaLabel}
              title={selectable && day ? `남은 ${day.availableSlotCount}칸` : undefined}
              className={`relative flex min-h-[56px] flex-col rounded-md p-2 text-left motion-safe:transition-colors sm:min-h-[78px] ${
                selected
                  ? 'border-2 border-ink bg-ink shadow-md'
                  : outOfWindow
                    ? 'border border-line bg-graysoft'
                    : selectable
                      ? 'cursor-pointer border border-line bg-paper hover:border-sage'
                      : 'border border-line bg-paper opacity-40'
              }`}
            >
              <span
                className={`font-mono text-[13px] font-bold sm:text-sm ${
                  selected ? 'text-cream' : outOfWindow || isPastOrUnknown ? 'text-charcoal-3' : 'text-charcoal'
                }`}
              >
                {cell.day}
              </span>
              {selectable && day && levelMeta && (
                <>
                  <span aria-hidden className="mb-1 mt-auto flex gap-[1.5px]">
                    {Array.from({ length: 8 }).map((_, barIndex) => {
                      const filled = barIndex < Math.round((day.availableSlotCount / TOTAL_SLOTS) * 8);
                      return (
                        <span
                          key={barIndex}
                          className={`h-1 flex-1 rounded-[1px] ${
                            filled
                              ? selected ? 'bg-sage' : levelMeta.barClass
                              : selected ? 'bg-cream/20' : 'bg-line'
                          }`}
                        />
                      );
                    })}
                  </span>
                  <span className={`text-[10.5px] font-bold ${selected ? 'text-sage' : levelMeta.textClass}`}>
                    {levelMeta.label}
                  </span>
                </>
              )}
              {outOfWindow && <span className="mt-auto text-[10.5px] text-charcoal-3">기간 외</span>}
              {isToday && <span aria-hidden className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-coral" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
