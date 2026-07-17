'use client';

import type { BookingDayAvailability, FacilityBookingRange } from '@duing/types';
import { rangeDatesLabel } from '../../_lib/bookingHome';
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
  // Rolling Window 구간(현재/다음). 있으면 구간 칩·오픈 마커로, 부재 시 windowLabel 단일 배지로 폴백한다.
  ranges?: FacilityBookingRange[] | null;
};

// 월간 탐색 그리드(§3) — 카드형 셀·히트맵·기간 외·오픈 마커·오늘 도트. 헤더(제목·화살표·범례)는
// 공용 BookingViewHeader 로 이관됐고, 카드 래퍼도 페이지가 소유한다. 창 칩 행·그리드·셀 로직은 무변경.
export function BookingCalendar({
  yearMonth, daysByIso, bookableFrom, bookableUntil, todayIso,
  selectedDate, onSelectDate, onOutOfWindowSelect, windowLabel, ranges,
}: Props) {
  const cells = buildMonthCells(yearMonth);
  // 마지막 구간(=다음 예약 가능) 시작일 = 예약 오픈일 마커 대상. ranges 부재 전환기엔 null(마커 없음).
  const openStartIso = ranges?.[ranges.length - 1]?.startDate ?? null;
  return (
    <div>
      {ranges && ranges.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {ranges.map((range, index) => (
            <span
              key={range.startDate}
              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                index === 0 ? 'bg-sage-mist text-ink' : 'bg-graysoft text-charcoal-2'
              }`}
            >
              {range.label} {rangeDatesLabel(range.startDate, range.endDate)}
            </span>
          ))}
        </div>
      ) : windowLabel ? (
        <div className="mb-2">
          <span className="inline-flex rounded-full bg-sage-mist px-3 py-1 text-xs font-bold text-ink">
            예약 가능 기간 {windowLabel}
          </span>
        </div>
      ) : null}
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
          // 다음 구간 시작일(오늘 이후)이면 예약 오픈 마커 — 데이터(ranges) 구동, 하드코딩 없음.
          const isOpenStart = openStartIso !== null && cell.iso === openStartIso && cell.iso >= todayIso;
          const baseAriaLabel = selectable && day && levelMeta
            ? `${cell.day}일 ${levelMeta.label}, 남은 ${day.availableSlotCount}칸`
            : outOfWindow
              ? `${cell.day}일 예약 기간 아님`
              : `${cell.day}일`;
          const ariaLabel = isOpenStart ? `${baseAriaLabel} 예약 오픈일` : baseAriaLabel;
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
              <span className="flex items-center gap-1">
                <span
                  className={`font-mono text-[13px] font-bold sm:text-sm ${
                    selected ? 'text-cream' : outOfWindow || isPastOrUnknown ? 'text-charcoal-3' : 'text-charcoal'
                  }`}
                >
                  {cell.day}
                </span>
                {isOpenStart && (
                  <span
                    aria-hidden
                    className="rounded-full bg-sage px-1.5 py-px text-[9px] font-bold leading-none text-ink-deep"
                  >
                    오픈
                  </span>
                )}
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
    </div>
  );
}
