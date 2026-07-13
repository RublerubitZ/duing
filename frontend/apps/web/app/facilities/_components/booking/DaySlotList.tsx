'use client';

import type { BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { isSelectableSlot, slotInRange } from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
  selection: SlotRange | null;
  onToggleSlot: (slotStart: string) => void;
};

function slotStatusLabel(day: BookingDayAvailability, index: number): string {
  const slot = day.slots[index];
  if (!slot) return '';
  if (slot.status === 'BLOCKED') {
    // SCHOOL 은 공개 단체명, INTERNAL 은 비노출 정책 → "예약됨" 일반 문구(§16 결정 20)
    return slot.blockedBy === 'SCHOOL' && slot.organization ? slot.organization : '예약됨';
  }
  if (slot.status === 'PENDING_HOLD') return '승인 대기중';
  if (slot.status === 'PAST') return '지난 시간';
  return '신청 가능';
}

export function DaySlotList({ day, selection, onToggleSlot }: Props) {
  return (
    <div>
      {day.operatingNotes.length > 0 && (
        <p className="mb-2 text-xs text-charcoal-3">
          {day.operatingNotes
            .map((note) => `운영: ${note.organization} ${note.start}~${note.end}`)
            .join(' · ')}
        </p>
      )}
      <ul className="flex flex-col gap-1" aria-label="시간대 선택">
        {day.slots.map((slot, index) => {
          const selectable = isSelectableSlot(slot);
          const selected = selection !== null && slotInRange(slot, selection);
          return (
            <li key={slot.start}>
              <button
                type="button"
                disabled={!selectable}
                aria-pressed={selected}
                onClick={() => onToggleSlot(slot.start)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm motion-safe:transition-colors ${
                  selected
                    ? 'border-ink bg-ink text-cream'
                    : selectable
                      ? 'border-line bg-paper hover:border-sage'
                      : 'border-transparent bg-graysoft/60 text-charcoal-3'
                }`}
              >
                <span className="font-mono text-[13px]">{slot.start}~{slot.end}</span>
                <span className={`text-xs ${selected ? 'text-cream/85' : slot.status === 'PENDING_HOLD' ? 'text-coral' : 'text-charcoal-3'}`}>
                  {slotStatusLabel(day, index)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
