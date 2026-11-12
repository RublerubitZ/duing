'use client';

import { useState } from 'react';

import type {
  InterviewRoundDetailMember,
  InterviewRoundDetailSlot,
  InterviewRoundStatus,
} from '@duing/types';

import { formatSlotRange } from '@/components/interview/_utils/localDateTime';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

// 수동 배정 모달 — ASSIGNING 한정 + SCHEDULED 일정 변경(재배정) 겸용.
// roundStatus 가 SCHEDULED 면 "변경 시 지원자에게 일정 변경 알림이 발송됩니다" 안내 노출.

type MemberAssignModalProps = {
  member: InterviewRoundDetailMember;
  slots: InterviewRoundDetailSlot[];
  /** 지금 화면의 라운드 단계 — SCHEDULED 면 일정 변경 알림 안내 문구 노출 */
  roundStatus: InterviewRoundStatus;
  onAssign: (slotId: number) => void;
  onCancel: () => void;
  isPending: boolean;
  /** 배정 실패 — 창을 닫지 않고 창 안에 표시 (전역 피드백은 스크림 뒤에 가린다) */
  errorMessage: string | null;
};

export function MemberAssignModal({
  member,
  slots,
  roundStatus,
  onAssign,
  onCancel,
  isPending,
  errorMessage,
}: MemberAssignModalProps) {
  // 고른 슬롯은 고른 때의 단계와 함께 둔다 — 다시 받은 상세에서 그 슬롯이 사라졌거나 단계가 바뀌었으면(확정 뒤엔 알림이 나간다) 다시 골라야 한다.
  const [selection, setSelection] = useState({ slotId: member.assignedSlotId, roundStatus });
  const selectedSlotId =
    selection.roundStatus === roundStatus && slots.some((slot) => slot.slotId === selection.slotId)
      ? selection.slotId
      : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      {/* 슬롯이 많으면 창이 화면을 넘는다 — 높이에 상한을 두고 목록만 스크롤해 제목·안내·실패 문구·버튼은 늘 보이게 한다 */}
      <DialogContent
        className="flex max-h-[calc(100dvh-4rem)] max-w-sm flex-col"
        aria-describedby={undefined}
        busy={isPending}
      >
        <DialogHeader>
          <DialogTitle>{member.userName} 수동 배정</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
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
                    onChange={() => setSelection({ slotId: slot.slotId, roundStatus })}
                    className="accent-ink"
                  />
                  <span className="text-sm text-charcoal">
                    {formatSlotRange(slot.startTime, slot.endTime)} · 정원 {slot.capacity}명
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {roundStatus === 'SCHEDULED' && (
          <p className="rounded-md bg-sky/10 px-3 py-2 text-xs text-sky-deep">
            변경 시 지원자에게 일정 변경 알림이 발송됩니다.
          </p>
        )}
        {errorMessage && (
          <div role="alert" className="rounded-md border border-coral/20 bg-coral/5 px-3 py-2 text-sm text-coral-deep">
            {errorMessage}
          </div>
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
            {isPending && <ButtonSpinner />}배정
          </button>
        </DialogFooter>
        <span role="status" className="sr-only">{isPending ? '수동 배정 중' : null}</span>
      </DialogContent>
    </Dialog>
  );
}
