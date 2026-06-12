'use client';

import { useState } from 'react';
import type { InterviewRoundDetailMember, InterviewRoundDetailSlot } from '@duing/types';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';

// 수동 배정 모달 — ASSIGNING 한정 + SCHEDULED 일정 변경(재배정) 겸용.
// showRescheduleNotice=true 시 "변경 시 지원자에게 일정 변경 알림이 발송됩니다" 안내 노출.

type MemberAssignModalProps = {
  member: InterviewRoundDetailMember;
  slots: InterviewRoundDetailSlot[];
  onAssign: (slotId: number) => void;
  onCancel: () => void;
  isPending: boolean;
  /** SCHEDULED 일정 변경 시 true — 알림 발송 안내 문구 노출 */
  showRescheduleNotice?: boolean;
};

export function MemberAssignModal({
  member,
  slots,
  onAssign,
  onCancel,
  isPending,
  showRescheduleNotice = false,
}: MemberAssignModalProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(member.assignedSlotId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-assign-modal-title"
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="member-assign-modal-title" className="text-base font-semibold text-slate-900">
          {member.userName} 수동 배정
        </h2>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">슬롯 선택</legend>
          <div className="space-y-2">
            {slots.map((slot) => (
              <label
                key={slot.slotId}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name="slot-assign"
                  value={slot.slotId}
                  checked={selectedSlotId === slot.slotId}
                  onChange={() => setSelectedSlotId(slot.slotId)}
                  className="accent-purple-600"
                />
                <span className="text-sm text-slate-700">
                  {formatSlotRange(slot.startTime, slot.endTime)} · 정원 {slot.capacity}명
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {showRescheduleNotice && (
          <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-700">
            변경 시 지원자에게 일정 변경 알림이 발송됩니다.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => selectedSlotId !== null && onAssign(selectedSlotId)}
            disabled={isPending || selectedSlotId === null}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '배정'}
          </button>
        </div>
      </div>
    </div>
  );
}
