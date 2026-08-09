'use client';

import type { BookingDayAvailability } from '@duing/types';
import { DAY_LEVEL_META, TOTAL_SLOTS, buildMonthCells, dayLevelOf, isWithinBookable } from '../../_lib/bookingCalendar';
import { LevelGauge } from './LevelGauge';

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
};

// 월간 탐색 그리드(§3) — 카드형 셀·혼잡도 게이지·오늘 도트. 창 밖 미래 날짜는 문구 없이 비활성 배경으로만
// 구분한다. 헤더(제목·화살표·범례)는 공용 BookingViewHeader 로 이관됐고, 카드 래퍼도 페이지가 소유한다.
// 좁은 모바일(≤375px)에서 "여유/보통/혼잡" 한글이 셀 폭을 넘어 "여/유" 로 분해되던 문제 —
// 상태 텍스트는 이해에 필요하므로 남기고, 대신 8칸 히트맵 바를 3칸 LevelGauge 로 압축해
// 폭을 벌어준다(gap·padding·폰트도 모바일만 축소). sm 이상은 기존 표기를 그대로 둔다.
export function BookingCalendar({
  yearMonth, daysByIso, bookableFrom, bookableUntil, todayIso,
  selectedDate, onSelectDate, onOutOfWindowSelect,
}: Props) {
  const cells = buildMonthCells(yearMonth);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center sm:gap-2">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={label}
            className={`py-1 text-[12.5px] font-bold ${index >= 5 ? 'text-charcoal-3' : 'text-charcoal-2'}`}
          >
            {label}
          </div>
        ))}
      </div>
      {/* 모바일은 gap-1 로 좁혀 셀 폭을 벌어준다 — 320px 에서 "여유" 한 줄이 들어갈 여유를 만드는 값. */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return <div key={cell.iso} aria-hidden className="min-h-[58px] sm:min-h-[92px]" />;
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
              // max-sm:overflow-hidden — 폰트 확대(안드로이드 텍스트 크기 조절 등)로 nowrap 라벨이 커져도
              // 옆 칸을 침범하지 않게 셀 안에서 잘린다. 7열 정렬이 무너지는 쪽이 잘리는 쪽보다 나쁘다.
              className={`relative flex min-h-[58px] flex-col items-center justify-center gap-[4px] rounded-md p-1 text-left motion-safe:transition-colors max-sm:overflow-hidden sm:min-h-[92px] sm:items-stretch sm:justify-start sm:gap-0 sm:p-2 ${
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
              {day && level !== null && levelMeta && (
                <>
                  <span className="flex sm:hidden">
                    <LevelGauge level={level} onDark={selected} />
                  </span>
                  <span aria-hidden className="mb-1 mt-auto hidden gap-[1.5px] sm:flex">
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
                  {/* nowrap 이 "여/유" 세로 분해를 원천 차단한다 — 폭이 모자라면 줄바꿈 대신 넘친다(셀이 클립).
                      모바일 전용 클래스는 sm: 로 되돌리지 않고 max-sm: 로 건다 — PC 는 선언 자체가 없어야
                      기존 계산값(.duing line-height 등)에 우연히 기대지 않는다. */}
                  <span
                    className={`text-[10px] font-bold max-sm:whitespace-nowrap max-sm:leading-none sm:text-[10.5px] ${
                      selected ? 'text-sage' : levelMeta.textClass
                    }`}
                  >
                    {levelMeta.label}
                  </span>
                </>
              )}
              {isToday && (
                <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-coral sm:right-2 sm:top-2" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
