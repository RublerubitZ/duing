'use client';

import type { ManagementSlotView } from '@duing/types';

// 운영진용 슬롯 카드 — Step 2 (SlotSection) 와 Step 4 (ScheduleManagementSection) 가 공용으로 사용.
// onAssign/onMove/onCancel 콜백은 선택값으로, 어떤 화면이 어떤 액션을 노출할지 결정한다.
//   - SlotSection: onCancel(슬롯 삭제)
//   - ScheduleManagementSection (PR-FE3): onMove / onCancel / onAssign
//
// `assignments` 가 비어있는(혹은 undefined) 시점은 Step 2 — 아직 자동배정 전. 이때는 신청 인원 수만 표시.
type Props = {
  slot: ManagementSlotView;
  // SlotSection 에서는 슬롯 자체 삭제 — slotId 만 받는 콜백.
  onDeleteSlot?: (slotId: number) => void;
  onAssign?: (slotId: number) => void;
  onMove?: (applicationId: number, fromSlotId: number) => void;
  onCancel?: (applicationId: number) => void;
};

// LocalDateTime(timezone-naive) 문자열을 그대로 받아 사용자에게 보여줄 한국어 range 로 포맷.
// UTC 변환을 거치면 KST 사용자 기준 9시간 어긋나므로 Intl 대신 컴포넌트 추출 방식 사용.
function formatRange(startTime: string, endTime: string): string {
  const startMatch = startTime.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/,
  );
  const endMatch = endTime.match(/T(\d{2}):(\d{2})/);
  if (!startMatch || !endMatch) {
    return `${startTime} ~ ${endTime}`;
  }
  const [, , month, day, startHour, startMinute] = startMatch;
  const [, endHour, endMinute] = endMatch;
  return `${Number(month)}월 ${Number(day)}일 ${startHour}:${startMinute} ~ ${endHour}:${endMinute}`;
}

export function ManagementSlotCard({
  slot,
  onDeleteSlot,
  onAssign,
  onMove,
  onCancel,
}: Props) {
  const assignedCount = slot.assignments?.length ?? 0;
  const remaining = slot.capacity - assignedCount;
  const hasAssignments = slot.assignments && slot.assignments.length > 0;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {formatRange(slot.startTime, slot.endTime)}
        </h3>
        {onDeleteSlot && (
          <button
            type="button"
            onClick={() => onDeleteSlot(slot.slotId)}
            aria-label="슬롯 삭제"
            className="rounded-md px-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
          >
            ×
          </button>
        )}
      </header>

      <p className="mt-1 text-xs text-slate-500">
        배정 {assignedCount}/{slot.capacity}명
        {slot.availabilityCount !== undefined && (
          <span> · 신청 {slot.availabilityCount}명</span>
        )}
      </p>

      {hasAssignments && (
        <ul className="mt-2 space-y-1">
          {slot.assignments?.map((assignment) => (
            <li
              key={assignment.scheduleId}
              className="flex items-center justify-between text-sm text-slate-700"
            >
              <span>{assignment.applicantLabel}</span>
              <span className="flex gap-2">
                {onMove && (
                  <button
                    type="button"
                    onClick={() => onMove(assignment.applicationId, slot.slotId)}
                    className="text-xs text-slate-500 underline hover:text-slate-700"
                  >
                    이동
                  </button>
                )}
                {onCancel && (
                  <button
                    type="button"
                    onClick={() => onCancel(assignment.applicationId)}
                    className="text-xs text-rose-600 underline hover:text-rose-800"
                  >
                    취소
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {onAssign && remaining > 0 && (
        <button
          type="button"
          onClick={() => onAssign(slot.slotId)}
          className="mt-3 w-full rounded-md bg-slate-100 py-1 text-sm text-slate-700 hover:bg-slate-200"
        >
          + 지원자 배정
        </button>
      )}
    </article>
  );
}
