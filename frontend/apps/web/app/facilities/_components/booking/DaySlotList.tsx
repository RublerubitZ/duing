'use client';

import type { BookingAvailabilitySlot, BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { bookingEntryOf, isDayApplicationClosed, isSelectableSlot, slotInRange } from '../../_lib/bookingCalendar';

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
  DEADLINE_PASSED: 'border-transparent bg-graysoft/60 text-charcoal-3',
};

// 라벨 규칙은 bookingEntryOf(단일 지점) 재사용. DEADLINE_PASSED 는 빈 슬롯의 신청 마감(사용일 전날 12:00 KST 경과).
function slotStatusLabel(slot: BookingAvailabilitySlot): string {
  const entry = bookingEntryOf(slot);
  if (entry !== null) return entry.label;
  if (slot.status === 'PAST') return '지난 시간';
  if (slot.status === 'DEADLINE_PASSED') return '신청 마감';
  return '예약 가능';
}

export function DaySlotList({ day, selection, onToggleSlot }: Props) {
  // 신청이 닫힌 날(서버 applicationClosed 우선, 구응답이면 빈 슬롯의 DEADLINE_PASSED 존재로 폴백) — 대기 슬롯도 새 신청
  // 대상이 아니라 행 전체를 잠근다(스펙 §3.3·§9.1). 최종 판단은 서버(신청 400)이며 폼 단계 힌트도 그대로 남는다(이중 방어).
  const dayClosed = isDayApplicationClosed(day);
  return (
    <div>
      {day.operatingNotes.length > 0 && (
        // 기본 확보 시간 안내(비차단 정보, 스펙 §3 복원) — 네이티브 아코디언(<details>).
        // 제목·단체·시간은 항상 노출, 긴 정책 설명만 기본 접힘(정보 밀도 §개선). 구응답(빈 배열)은 미렌더(fail-soft).
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
      {dayClosed && (
        <p role="note" className="mb-2 rounded-lg bg-graysoft/60 px-3 py-2 text-xs text-charcoal-2">
          신청이 마감된 날짜예요. 시설 사용일 전날 12:00까지만 신청할 수 있어요.
        </p>
      )}
      <ul className="flex flex-col gap-1" aria-label="시간대 선택">
        {day.slots.map((slot) => {
          const selectable = isSelectableSlot(slot) && !dayClosed;
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
                <span className="tabular-nums text-[13px] font-bold">{slot.start}~{slot.end}</span>
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
