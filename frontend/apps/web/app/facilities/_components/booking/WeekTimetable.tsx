'use client';

import type { BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { isWithinBookable, slotInRange, weekDatesOf } from '../../_lib/bookingCalendar';

const HOURS = Array.from({ length: 13 }, (_, index) => 9 + index);
// 월요일 시작 — weekDatesOf 와 정렬(colIndex 0=월 … 6=일). BookingCalendar 요일 헤더와 동일 순서.
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const pad2 = (value: number) => String(value).padStart(2, '0');

type Props = {
  selectedDate: string;
  daysByIso: Map<string, BookingDayAvailability>;
  bookableFrom: string;
  bookableUntil: string;
  todayIso: string;
  selection: SlotRange | null;
  onSelectDate: (iso: string) => void;
  onTapSlot: (iso: string, slotStart: string) => void;
};

// 셀 상태(SLOT_STYLE ↔ 두잉 토큰, §4) — 라벨은 aria/셀 표기 공용, tone 은 비선택 셀 배경·보더.
type CellState = { statusText: string; toneClass: string; selectable: boolean; showPending?: boolean };

/**
 * 주간 타임테이블(§4·목업 F3) — 좌측 시간 라벨 열 + 7일 컬럼(월~일) 그리드.
 * 셀 탭 = 시간 선택(onTapSlot: 선택일=토글, 다른 요일=그 날 전환+단일 선택). 선택일 컬럼은
 * ink 프레임 + sage tint + 요일 "· 선택" 접미로 강조한다. 차단·지난·창 밖·데이터 없음 셀은 비활성.
 */
export function WeekTimetable({
  selectedDate,
  daysByIso,
  bookableFrom,
  bookableUntil,
  todayIso,
  selection,
  onSelectDate,
  onTapSlot,
}: Props) {
  const weekDates = weekDatesOf(selectedDate);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-separate border-spacing-0 text-center">
        <thead>
          <tr>
            <th className="w-12" aria-hidden />
            {weekDates.map((iso, colIndex) => {
              const isSelectedColumn = iso === selectedDate;
              const dayNumber = Number(iso.slice(8, 10));
              const dayEnabled = daysByIso.has(iso) && isWithinBookable(iso, bookableFrom, bookableUntil);
              return (
                <th
                  key={iso}
                  className={`p-0 ${
                    isSelectedColumn ? 'rounded-t-md border-l border-r border-t border-ink bg-sage/20' : ''
                  }`}
                >
                  <button
                    type="button"
                    disabled={!dayEnabled}
                    onClick={() => onSelectDate(iso)}
                    aria-label={`${WEEKDAY_LABELS[colIndex]}요일 ${dayNumber}일${isSelectedColumn ? ' · 선택' : ''}`}
                    className="flex w-full flex-col items-center gap-0.5 px-1 py-1.5 disabled:cursor-default disabled:opacity-40"
                  >
                    <span className={`text-[10px] font-medium ${isSelectedColumn ? 'text-ink' : 'text-charcoal-3'}`}>
                      {WEEKDAY_LABELS[colIndex]}
                      {isSelectedColumn ? ' · 선택' : ''}
                    </span>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[12px] font-bold ${
                        isSelectedColumn ? 'bg-ink text-cream' : 'text-charcoal'
                      }`}
                    >
                      {dayNumber}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour, rowIndex) => {
            const isLastRow = rowIndex === HOURS.length - 1;
            return (
              <tr key={hour}>
                <td className="pr-1.5 align-top text-right">
                  <span className="font-mono text-[10px] text-charcoal-3">{pad2(hour)}:00</span>
                </td>
                {weekDates.map((iso, colIndex) => {
                  const isSelectedColumn = iso === selectedDate;
                  const tdFrameClass = isSelectedColumn
                    ? `border-l border-r border-ink bg-sage/20 ${isLastRow ? 'rounded-b-md border-b' : ''}`
                    : '';
                  const slot = daysByIso.get(iso)?.slots[hour - 9];
                  if (slot === undefined) {
                    return (
                      <td key={iso} className={`p-[2px] ${tdFrameClass}`}>
                        <div aria-hidden className="h-9 rounded-[5px] border border-transparent sm:h-10" />
                      </td>
                    );
                  }
                  const withinWindow = isWithinBookable(iso, bookableFrom, bookableUntil);
                  const isPast = slot.status === 'PAST' || iso < todayIso;
                  const selected = isSelectedColumn && selection !== null && slotInRange(slot, selection);
                  const state = cellStateOf(slot.status, withinWindow, isPast);
                  return (
                    <td key={iso} className={`p-[2px] ${tdFrameClass}`}>
                      <button
                        type="button"
                        disabled={!state.selectable}
                        aria-pressed={state.selectable ? selected : undefined}
                        aria-label={`${WEEKDAY_LABELS[colIndex]}요일 ${Number(iso.slice(8, 10))}일 ${pad2(hour)}:00 ${state.statusText}`}
                        onClick={state.selectable ? () => onTapSlot(iso, slot.start) : undefined}
                        className={`flex h-9 w-full items-center justify-center rounded-[5px] border text-[9px] font-bold leading-none disabled:cursor-default sm:h-10 ${
                          selected ? 'border-sage bg-ink text-cream shadow-sm' : state.toneClass
                        }`}
                      >
                        {selected ? '✓' : state.showPending ? <span className="text-[#8E6620]">대기</span> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 셀 상태 파생 — 창 밖(게이팅) > 지난 > 예약됨 > 대기 > 가능 순. 가능·대기만 탭 가능(§4).
function cellStateOf(
  status: BookingDayAvailability['slots'][number]['status'],
  withinWindow: boolean,
  isPast: boolean,
): CellState {
  if (!withinWindow) return { statusText: '예약 기간 아님', toneClass: 'border-line/60 bg-graysoft/40', selectable: false };
  if (isPast) return { statusText: '지난', toneClass: 'border-line/60 bg-graysoft/40', selectable: false };
  if (status === 'BLOCKED') return { statusText: '예약됨', toneClass: 'border-line bg-graysoft', selectable: false };
  if (status === 'PENDING_HOLD')
    return { statusText: '대기', toneClass: 'border-warm/60 bg-warm/15', selectable: true, showPending: true };
  return { statusText: '가능', toneClass: 'border-sage-soft bg-sage-mist', selectable: true };
}
