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

// SCHOOL 차단만 단체명을 공개 → 그 행에만 "예약됨" pill 배지를 붙인다(§4″.1). 단체명이 곧 주 정보라 배지와 중복되지 않는다.
function isSchoolNamedSlot(slot: BookingAvailabilitySlot): boolean {
  return slot.status === 'BLOCKED' && slot.blockedBy === 'SCHOOL' && Boolean(slot.organization);
}

// 주 정보(By 중심, organization ?? 상태 문구): SCHOOL 은 단체명, INTERNAL·PENDING 은 비노출 정책이라 상태 문구가 곧 주 정보(§4″.1).
function slotPrimaryInfo(slot: BookingAvailabilitySlot): string {
  if (slot.status === 'BLOCKED') {
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
        {day.slots.map((slot) => {
          const selectable = isSelectableSlot(slot);
          const selected = selection !== null && slotInRange(slot, selection);
          const primaryInfo = slotPrimaryInfo(slot);
          return (
            <li key={slot.start}>
              <button
                type="button"
                disabled={!selectable}
                aria-pressed={selected}
                aria-label={`${slot.start}~${slot.end} ${primaryInfo}`}
                onClick={() => onToggleSlot(slot.start)}
                className={`flex w-full flex-col gap-1 rounded-xl border px-3.5 py-3 text-left motion-safe:transition-colors ${
                  selected ? 'border-ink-deep bg-ink text-cream' : SLOT_ROW_CLASS[slot.status]
                }`}
              >
                {/* 80: 70은 warm/15 위 11px 일반 굵기가 WCAG AA(4.5:1) 미달 추정 — 리뷰 지적 흡수 */}
                <span className="font-mono text-[11px] opacity-80">{slot.start}~{slot.end}</span>
                <span className="text-sm font-bold">
                  {selected && <span aria-hidden="true">✓ </span>}
                  {primaryInfo}
                </span>
                {isSchoolNamedSlot(slot) && (
                  <span
                    className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10.5px] ${
                      selected ? 'border-cream/40 bg-cream/15 text-cream' : 'border-line bg-paper/70 text-charcoal-3'
                    }`}
                  >
                    예약됨
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
