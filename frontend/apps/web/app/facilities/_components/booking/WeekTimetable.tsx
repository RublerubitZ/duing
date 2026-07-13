'use client';

import type { BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { slotInRange, weekDatesOf } from '../../_lib/bookingCalendar';

const HOURS = Array.from({ length: 13 }, (_, index) => 9 + index);
const pad2 = (value: number) => String(value).padStart(2, '0');

type Props = {
  selectedDate: string;
  daysByIso: Map<string, BookingDayAvailability>;
  selection: SlotRange | null;
  onSelectDate: (iso: string) => void;
};

/** 주간 타임테이블(§9.5) — 선택일 컬럼 강조, 월 데이터 범위 밖 요일은 빈 컬럼. */
export function WeekTimetable({ selectedDate, daysByIso, selection, onSelectDate }: Props) {
  const weekDates = weekDatesOf(selectedDate);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[430px] border-separate border-spacing-0 text-center text-[11px]">
        <thead>
          <tr>
            <th className="w-11" aria-hidden />
            {weekDates.map((iso) => (
              <th key={iso} className="px-0 py-0">
                <button
                  type="button"
                  disabled={!daysByIso.has(iso)}
                  onClick={() => onSelectDate(iso)}
                  className={`w-full rounded-t-md px-1 py-1.5 text-[11px] font-medium disabled:cursor-default disabled:opacity-40 ${
                    iso === selectedDate ? 'bg-ink text-cream' : 'text-charcoal-2'
                  }`}
                >
                  {Number(iso.slice(8, 10))}일
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour}>
              <td className="pr-1 text-right font-mono text-charcoal-3">{pad2(hour)}</td>
              {weekDates.map((iso) => {
                const slot = daysByIso.get(iso)?.slots[hour - 9];
                const isSelectedColumn = iso === selectedDate;
                const selected =
                  isSelectedColumn && selection !== null && slot !== undefined && slotInRange(slot, selection);
                const tone =
                  slot === undefined
                    ? 'border-transparent bg-transparent'
                    : slot.status === 'BLOCKED'
                      ? 'border-line/60 bg-graysoft'
                      : slot.status === 'PENDING_HOLD'
                        ? 'border-dashed border-coral/60 bg-paper'
                        : slot.status === 'PAST'
                          ? 'border-line/60 bg-graysoft/40'
                          : 'border-line/60 bg-paper';
                return (
                  <td key={iso} className="p-[1.5px]">
                    <div
                      className={`h-5 rounded-[4px] ${
                        selected ? 'border border-ink bg-ink' : `border ${tone}`
                      } ${isSelectedColumn && !selected ? 'ring-1 ring-ink/20' : ''}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
