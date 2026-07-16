'use client';

import type { BookingAvailabilitySlot, BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { isSelectableSlot, slotInRange } from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
  selection: SlotRange | null;
  onToggleSlot: (slotStart: string) => void;
};

// 상태 → 행 클래스(스펙 §4′.1 SLOT_STYLE 매핑) — 행 전체가 상태색을 입는다. 선택 행은 이 표를 덮어쓴다.
const SLOT_ROW_CLASS: Record<BookingAvailabilitySlot['status'], string> = {
  AVAILABLE: 'border-sage-soft bg-sage-mist text-ink hover:border-sage',
  PENDING_HOLD: 'border-warm/60 bg-warm/15 text-charcoal-2 hover:border-warm',
  BLOCKED: 'border-line bg-graysoft text-charcoal-3',
  PAST: 'border-transparent bg-graysoft/60 text-charcoal-3',
};

function slotStatusLabel(day: BookingDayAvailability, index: number): string {
  const slot = day.slots[index];
  if (!slot) return '';
  if (slot.status === 'BLOCKED') {
    // SCHOOL 은 공개 단체명, INTERNAL 은 비노출 정책 → "예약됨" 일반 문구(§16 결정 20)
    return slot.blockedBy === 'SCHOOL' && slot.organization ? slot.organization : '예약됨';
  }
  if (slot.status === 'PENDING_HOLD') return '승인 대기';
  if (slot.status === 'PAST') return '지난 시간';
  return '예약 가능';
}

export function DaySlotList({ day, selection, onToggleSlot }: Props) {
  return (
    <div>
      {day.operatingNotes.length > 0 && (
        <div className="mb-2 rounded-lg border border-line bg-graysoft/40 px-3 py-2 text-xs">
          <p className="font-bold text-ink">운영 시간 안내</p>
          <p className="mt-0.5 text-charcoal-2">
            {day.operatingNotes.map((note) => `${note.organization} ${note.start}~${note.end}`).join(' · ')}
          </p>
          <p className="mt-1 text-charcoal-3">
            시간 범위가 함께 표시된 일정은 운영상 확보된 시간 안내예요. 이 시간에도 예약을 신청할 수 있고,
            관리자 승인 후 학교 반영 절차를 거쳐 확정돼요.
          </p>
        </div>
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
                className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-sm motion-safe:transition-colors ${
                  selected ? 'border-ink-deep bg-ink text-cream' : SLOT_ROW_CLASS[slot.status]
                }`}
              >
                <span className="font-mono text-[13px] font-bold">{slot.start}~{slot.end}</span>
                <span className={selected ? 'text-xs text-cream/85' : 'text-xs'}>
                  {selected ? '✓ ' : ''}{slotStatusLabel(day, index)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
