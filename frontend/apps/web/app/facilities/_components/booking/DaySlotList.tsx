'use client';

import type { BookingAvailabilitySlot, BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { bookingEntryOf, isSelectableSlot, slotInRange } from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
  // 그 날이 신청 창 안인가 — 창 밖(기록 열람: 오픈일 NULL·내일 오픈인 시설의 오늘)이면 빈 칸·대기 칸도 잠근다.
  bookable: boolean;
  selection: SlotRange | null;
  onToggleSlot: (slotStart: string) => void;
};

// 상태 → 행 클래스(스펙 §4⁗.2 흰 바탕 복원) — 선택 가능 행은 흰 바탕, 선택 불가 행은 muted.
// 선택 행은 호출부에서 이 표를 덮어쓴다. PENDING_HOLD 강조는 배경이 아닌 라벨 색(text-coral-deep)으로.
const SLOT_ROW_CLASS: Record<BookingAvailabilitySlot['status'], string> = {
  AVAILABLE: 'border-line bg-paper hover:border-sage hover:bg-sage-mist/60',
  PENDING_HOLD: 'border-line bg-paper hover:border-sage hover:bg-sage-mist/60',
  BLOCKED: 'border-transparent bg-graysoft/60 text-charcoal-3',
  PAST: 'border-transparent bg-graysoft/60 text-charcoal-3',
};

// 라벨 규칙은 bookingEntryOf(단일 지점) 재사용. 창 밖 빈 칸은 주간 격자와 같은 "예약 기간 아님".
function slotStatusLabel(slot: BookingAvailabilitySlot, bookable: boolean): string {
  const entry = bookingEntryOf(slot);
  if (entry !== null) return entry.label;
  if (slot.status === 'PAST') return '지난 시간';
  return bookable ? '예약 가능' : '예약 기간 아님';
}

export function DaySlotList({ day, bookable, selection, onToggleSlot }: Props) {
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
      {/* 학교 규정 안내 — 신청을 막지는 않는다(2026-11-17 마감 규칙 삭제, 당일은 시작 전 시간까지 신청 가능). */}
      <p role="note" className="mb-2 rounded-lg bg-graysoft/60 px-3 py-2 text-xs text-charcoal-2">
        시설 사용일 전날 12:00까지 신청해 주세요.
      </p>
      <ul className="flex flex-col gap-1" aria-label="시간대 선택">
        {day.slots.map((slot) => {
          const selectable = bookable && isSelectableSlot(slot);
          const selected = selection !== null && slotInRange(slot, selection);
          // 승인 대기 강조는 흰 바탕 위 라벨 색으로(§4⁗.2). 선택 행은 cream 톤이 우선한다.
          const labelClass = selected
            ? 'text-xs text-cream/85'
            : slot.status === 'PENDING_HOLD'
              ? 'text-xs text-coral-deep'
              : 'text-xs';
          return (
            <li key={slot.start}>
              <button
                type="button"
                disabled={!selectable}
                aria-pressed={selected}
                onClick={() => onToggleSlot(slot.start)}
                className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-sm motion-safe:transition-colors ${
                  // 창 밖 날의 빈 칸·대기 칸은 지난 행과 같은 muted 로 잠긴다.
                  selected ? 'border-ink-deep bg-ink text-cream' : bookable ? SLOT_ROW_CLASS[slot.status] : SLOT_ROW_CLASS.PAST
                }`}
              >
                <span className="tabular-nums text-[13px] font-bold">{slot.start}~{slot.end}</span>
                <span className={labelClass}>
                  {selected ? '✓ ' : ''}{slotStatusLabel(slot, bookable)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
