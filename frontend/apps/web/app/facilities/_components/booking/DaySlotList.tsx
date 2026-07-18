'use client';

import type { BookingAvailabilitySlot, BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { isSelectableSlot, slotInRange } from '../../_lib/bookingCalendar';

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

function slotStatusLabel(day: BookingDayAvailability, index: number): string {
  const slot = day.slots[index];
  if (!slot) return '';
  if (slot.status === 'BLOCKED') {
    // organization 이 오면 소스(SCHOOL/INTERNAL) 무관 동아리명 노출(§4⁗.1 정책 반전),
    // 없으면 "예약됨" 폴백 — 구 백엔드 응답에서도 동작(fail-open).
    return slot.organization || '예약됨'; // ||: 빈 문자열도 폴백(bookingEntryOf 와 동일 기준)
  }
  if (slot.status === 'PENDING_HOLD') return '승인 대기';
  if (slot.status === 'PAST') return '지난 시간';
  return '예약 가능';
}

export function DaySlotList({ day, selection, onToggleSlot }: Props) {
  return (
    <div>
      {day.operatingNotes.length > 0 && (
        // 네이티브 아코디언(<details>) — 제목·단체·시간은 항상 노출, 긴 정책 설명만 기본 접힘(정보 밀도 §개선).
        <details className="group mb-2 rounded-lg border border-line bg-graysoft/40 px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between">
              <span className="font-bold text-ink">기본 확보 시간</span>
              <span className="flex items-center gap-1 text-charcoal-2">
                {/* 접힘 상태 어포던스 — 화살표만으론 펼침 가능 여부 인지가 약해 텍스트 라벨 병기 */}
                <span className="text-[11px]">
                  <span className="group-open:hidden">설명 보기</span>
                  <span className="hidden group-open:inline">접기</span>
                </span>
                <span
                  aria-hidden
                  className="text-xl leading-none motion-safe:transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </span>
            </span>
            <span className="mt-0.5 block text-charcoal-2">
              {day.operatingNotes.map((note) => `${note.organization} ${note.start}~${note.end}`).join(' · ')}
            </span>
          </summary>
          <p className="mt-1 text-charcoal-3">
            학교와 협의되어 기본적으로 이 동아리가 사용하는 시간이에요. 다른 동아리도 같은 시간에 예약을
            신청할 수 있고, 관리자 승인 후 일정 조정을 거쳐 이용할 수 있어요.
          </p>
        </details>
      )}
      <ul className="flex flex-col gap-1" aria-label="시간대 선택">
        {day.slots.map((slot, index) => {
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
