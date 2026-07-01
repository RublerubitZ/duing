'use client';

import { useState } from 'react';

import {
  AXIS_START_HOUR,
  TIMELINE_HOURS,
  buildTimelineSegments,
  daysInMonth,
  seoulDateIso,
  seoulMinutesOfDay,
  timelineIndicatorPct,
  type TimelineSegment,
} from '../_lib/facilityTimeline';
import type { ReservationSlot } from '@duing/types';

const RESERVED_FILL = '#2E6149';
const EMPTY_FILL = '#F0EDE5';
const INDICATOR = '#D9523A';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function FacilityTimeline({
  reservations,
  yearMonth,
}: {
  reservations: ReservationSlot[];
  yearMonth: string;
}) {
  const now = new Date();
  const todayIso = seoulDateIso(now);
  const todayInMonth = todayIso.startsWith(yearMonth);
  const totalDays = daysInMonth(yearMonth);
  const defaultDay = todayInMonth ? Number(todayIso.slice(8, 10)) : 1;

  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const selectedDate = `${yearMonth}-${pad2(selectedDay)}`;
  const segments = buildTimelineSegments(reservations, selectedDate);
  const indicatorPct =
    selectedDate === todayIso ? timelineIndicatorPct(seoulMinutesOfDay(now)) : null;
  const activeSegment: TimelineSegment | null =
    activeIndex !== null ? segments[activeIndex] ?? null : null;

  return (
    <div className="rounded-[18px] border border-line bg-paper p-4 sm:p-5">
      {/* 날짜 선택 */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {Array.from({ length: totalDays }, (_, index) => index + 1).map((day) => {
          const on = day === selectedDay;
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setSelectedDay(day);
                setActiveIndex(null);
              }}
              className={`h-8 w-8 shrink-0 rounded-full text-[13px] font-semibold motion-safe:transition-colors ${
                on ? 'bg-ink text-white' : 'bg-transparent text-charcoal-2 hover:bg-graysoft'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* 시간 축 트랙 */}
      <div className="relative">
        <div className="relative h-10 w-full overflow-hidden rounded-[10px]" style={{ background: EMPTY_FILL }}>
          {segments.map((segment, index) => (
            <button
              key={`${segment.startMinutes}-${index}`}
              type="button"
              aria-label={`${segment.organization} 예약`}
              title={`${segment.organization} ${segment.startLabel}~${segment.endLabel}`}
              onClick={() => setActiveIndex(index)}
              className="absolute top-0 h-full motion-safe:transition-opacity"
              style={{
                left: `${segment.leftPct}%`,
                width: `${segment.widthPct}%`,
                background: RESERVED_FILL,
                opacity: activeIndex === null || activeIndex === index ? 1 : 0.6,
              }}
            />
          ))}
          {indicatorPct !== null && (
            <span
              aria-hidden
              className="absolute top-0 h-full w-[2px]"
              style={{ left: `${indicatorPct}%`, background: INDICATOR }}
            />
          )}
        </div>

        {/* 시간 라벨(짝수 시각만) */}
        <div className="mt-1.5 flex justify-between text-[10px] text-charcoal-3" style={{ fontFamily: 'var(--font-mono)' }}>
          {TIMELINE_HOURS.filter((hour) => hour % 2 === AXIS_START_HOUR % 2).map((hour) => (
            <span key={hour}>{pad2(hour)}</span>
          ))}
        </div>
      </div>

      {/* 선택된 예약 상세 */}
      <div className="mt-3 min-h-[1.5rem] text-[13px]">
        {activeSegment ? (
          <p>
            <span className="font-bold" style={{ color: RESERVED_FILL }}>
              {activeSegment.startLabel} ~ {activeSegment.endLabel}
            </span>{' '}
            · 단체 {activeSegment.organization}
          </p>
        ) : (
          <p className="text-charcoal-3">예약 구간을 눌러 사용 단체와 시간을 확인하세요.</p>
        )}
      </div>
    </div>
  );
}
