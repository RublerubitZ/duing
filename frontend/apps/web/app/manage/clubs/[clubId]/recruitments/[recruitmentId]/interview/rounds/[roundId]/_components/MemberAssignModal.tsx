'use client';

import { useState } from 'react';

import type { InterviewRoundDetailMember, InterviewRoundDetailSlot } from '@duing/types';

import { formatSlotRange } from '@/components/interview/_utils/localDateTime';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-sm"
        aria-describedby={undefined}
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{member.userName} 수동 배정</DialogTitle>
        </DialogHeader>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-charcoal-2">슬롯 선택</legend>
          <div className="space-y-2">
            {slots.map((slot) => (
              <label
                key={slot.slotId}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-3 py-2 transition-colors hover:bg-sage-tint"
              >
                <input
                  type="radio"
                  name="slot-assign"
                  value={slot.slotId}
                  checked={selectedSlotId === slot.slotId}
                  onChange={() => setSelectedSlotId(slot.slotId)}
                  className="accent-ink"
                />
                <span className="text-sm text-charcoal">
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

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={() => selectedSlotId !== null && onAssign(selectedSlotId)}
            disabled={isPending || selectedSlotId === null}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '배정'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
