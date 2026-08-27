'use client';

import type { BookingAvailabilitySlot, BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { bookingEntryOf, isSelectableSlot, slotInRange } from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
  selection: SlotRange | null;
  onToggleSlot: (slotStart: string) => void;
};

// 상태 → 행 클래스(스펙 §4⁗.2 흰 바탕 복원) — 선택 가능 행은 흰 바탕, 선택 불가 행은 muted.
// 선택 행은 호출부에서 이 표를 덮어쓴다. PENDING_HOLD 강조는 배경이 아닌 라벨 색(text-coral)으로.
const SLOT_ROW_CLASS: Record<BookingAvailabilitySlot['status'], string> = {
  AVAILABLE: 'border-line bg-paper hover:border-sage hover:bg-sage-mist/60',
  PENDING_HOLD: 'border-line bg-paper hover:border-sage hover:bg-sage-mist/60',
  BLOCKED: 'border-transparent bg-graysoft/60 text-charcoal-3',
  PAST: 'border-transparent bg-graysoft/60 text-charcoal-3',
};

// 라벨 규칙은 bookingEntryOf(단일 지점) 재사용 — 기본 확보 시간만 접미로 관리 의미를 구분한다(차단은 동일).
function slotStatusLabel(slot: BookingAvailabilitySlot): string {
  const entry = bookingEntryOf(slot);
  if (entry !== null) {
    return entry.kind === 'BASIC_SECURED' ? `${entry.label} · 기본 확보` : entry.label;
  }
  if (slot.status === 'PAST') return '지난 시간';
  return '예약 가능';
}

export function DaySlotList({ day, selection, onToggleSlot }: Props) {
  return (
    <div>
      <ul className="flex flex-col gap-1" aria-label="시간대 선택">
        {day.slots.map((slot) => {
          const selectable = isSelectableSlot(slot);
          const selected = selection !== null && slotInRange(slot, selection);
          // 승인 대기 강조는 흰 바탕 위 라벨 색으로(§4⁗.2). 선택 행은 cream 톤이 우선한다.
          const labelClass = selected
            ? 'text-xs text-cream/85'
            : slot.status === 'PENDING_HOLD'
              ? 'text-xs text-coral'
              : 'text-xs';
          return (
            <li key={slot.start}>
              <button
                type="button"
                disabled={!selectable}
                aria-pressed={selected}
                onClick={() => onToggleSlot(slot.start)}
                className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-sm motion-safe:transition-colors ${
                  selected ? 'border-ink-deep bg-ink text-cream' : SLOT_ROW_CLASS[slot.status]
                }`}
              >
                <span className="font-mono text-[13px] font-bold">{slot.start}~{slot.end}</span>
                <span className={labelClass}>
                  {selected ? '✓ ' : ''}{slotStatusLabel(slot)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
