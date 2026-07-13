'use client';

import type { BookingDayAvailability } from '@duing/types';
import { bookingDateLabel } from '@/app/_lib/bookingDisplay';
import {
  DAY_LEVEL_META,
  dayLevelOf,
  firstAvailableStarts,
  periodDistribution,
} from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
  onQuickSelect: (slotStart: string) => void;
};

export function PanelSummaryCard({ day, onQuickSelect }: Props) {
  const level = dayLevelOf(day.availableSlotCount);
  const quickStarts = firstAvailableStarts(day.slots, 3);
  const remaining = day.availableSlotCount - quickStarts.length;
  return (
    <div className="rounded-xl bg-ink p-4 text-cream">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-wide text-sage">선택한 날짜</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${level === 'FULL' ? 'bg-graysoft text-charcoal-3' : 'bg-sage text-ink'}`}>
          {DAY_LEVEL_META[level].label}
        </span>
      </div>
      <p className="mt-1 font-display text-xl">{bookingDateLabel(day.date)}</p>

      <div className="mt-3 space-y-1.5">
        {periodDistribution(day.slots).map((period) => (
          <div key={period.key} className="flex items-center gap-2 text-[11px]">
            <span className="w-7 font-bold text-cream/90">{period.label}</span>
            <span className="w-11 font-mono text-cream/50">{period.range}</span>
            <span aria-hidden className="flex flex-1 gap-[2px]">
              {Array.from({ length: period.total }).map((_, index) => (
                <span key={index} className={`h-1.5 flex-1 rounded-[2px] ${index < period.free ? 'bg-sage' : 'bg-cream/15'}`} />
              ))}
            </span>
            <span className="w-8 text-right font-mono">{period.free}/{period.total}</span>
          </div>
        ))}
      </div>

      {quickStarts.length > 0 && (
        <div className="mt-3 border-t border-cream/15 pt-3">
          <p className="mb-1.5 text-[11px] text-cream/60">바로 신청 가능한 시간</p>
          <div className="flex gap-1.5">
            {quickStarts.map((start) => (
              <button
                key={start}
                type="button"
                onClick={() => onQuickSelect(start)}
                className="flex-1 rounded-lg bg-cream/15 py-1.5 font-mono text-xs font-bold text-cream hover:bg-cream/25"
              >
                {start}
              </button>
            ))}
            {remaining > 0 && <span className="grid w-9 place-items-center rounded-lg bg-cream/10 text-xs text-cream/70">+{remaining}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
