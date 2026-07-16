'use client';

import type { BookingDayAvailability } from '@duing/types';
import { bookingDateLabel } from '@/app/_lib/bookingDisplay';
import {
  DAY_LEVEL_META,
  type DayLevel,
  dayLevelOf,
  firstAvailableStarts,
  periodDistribution,
  slotStatusCounts,
} from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
  onQuickSelect: (slotStart: string) => void;
};

// 레벨 뱃지 색-라벨 정합(여유/보통/혼잡/마감 각각 sage/warm/coral/graysoft 계열).
const LEVEL_BADGE_CLASS: Record<DayLevel, string> = {
  HIGH: 'bg-sage text-ink',
  MID: 'bg-warm text-ink-deep',
  LOW: 'bg-coral text-cream',
  FULL: 'bg-graysoft text-charcoal-3',
};

export function PanelSummaryCard({ day, onQuickSelect }: Props) {
  const level = dayLevelOf(day.availableSlotCount);
  const quickStarts = firstAvailableStarts(day.slots, 3);
  const remaining = day.availableSlotCount - quickStarts.length;
  const counts = slotStatusCounts(day.slots);
  const operatingRange = day.slots.length > 0
    ? `${day.slots[0]?.start}~${day.slots[day.slots.length - 1]?.end}`
    : null;
  const statusEntries = [
    { key: 'available', label: '신청 가능', count: counts.available, dotClass: 'bg-sage' },
    { key: 'pendingHold', label: '승인 대기', count: counts.pendingHold, dotClass: 'bg-coral' },
    { key: 'blocked', label: '예약됨', count: counts.blocked, dotClass: 'bg-cream/40' },
    { key: 'past', label: '지난 시간', count: counts.past, dotClass: 'bg-cream/15' },
  ].filter((entry) => entry.count > 0);
  return (
    <div className="rounded-xl bg-ink p-4 text-cream">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-wide text-sage">선택한 날짜</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${LEVEL_BADGE_CLASS[level]}`}>
          {DAY_LEVEL_META[level].label}
        </span>
      </div>
      <p className="mt-1 font-display text-xl">{bookingDateLabel(day.date)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cream/80">
        {statusEntries.map((entry) => (
          <span key={entry.key} className="inline-flex items-center gap-1">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${entry.dotClass}`} />
            {entry.label} <span className="font-mono font-bold text-cream">{entry.count}칸</span>
          </span>
        ))}
      </div>
      {operatingRange && (
        <p className="mt-1.5 text-[11px] text-cream/50">운영 시간 {operatingRange} · {day.slots.length}칸</p>
      )}

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
