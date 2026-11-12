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
// roundStatus 가 SCHEDULED 면 제목·진행 문구를 일정 변경으로 바꾸고, "변경 시 지원자에게 일정 변경 알림이 발송됩니다" 안내와
// 지금 일정 표지를 보이며, 지금 일정 그대로면 [배정]을 끈다(같은 슬롯이어도 서버가 지원자에게 일정 변경 알림을 보낸다).

type MemberAssignModalProps = {
  /** 지금 상세의 그 멤버 — 지금 일정(assignedSlotId) 판정과, 아직 고르지 않은 동안의 선택에 쓴다 */
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
  // slotId null = 아직 고르지 않음 — 그동안은 그때그때의 지금 일정을 따른다(창이 열린 사이 다른 탭이 옮긴 일정을 낡은 슬롯으로 되돌리지 않게).
  const [selection, setSelection] = useState<{ slotId: number | null; roundStatus: InterviewRoundStatus }>({ slotId: null, roundStatus });
  const candidateSlotId = selection.slotId ?? member.assignedSlotId;
  const selectedSlotId =
    selection.roundStatus === roundStatus && slots.some((slot) => slot.slotId === candidateSlotId)
      ? candidateSlotId
      : null;
  const isReschedule = roundStatus === 'SCHEDULED';
  const keepsCurrentSchedule = isReschedule && selectedSlotId === member.assignedSlotId;

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
          <DialogTitle>{member.userName} {isReschedule ? '일정 변경' : '수동 배정'}</DialogTitle>
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
                    // 지금 일정을 다시 고르면 손대지 않은 것으로 돌린다 — 고정하면 다른 탭이 옮긴 뒤 낡은 슬롯이 남는다.
                    onChange={() => setSelection({ slotId: slot.slotId === member.assignedSlotId ? null : slot.slotId, roundStatus })}
                    className="accent-ink"
                  />
                  <span className="text-sm text-charcoal">
                    {formatSlotRange(slot.startTime, slot.endTime)} · 정원 {slot.capacity}명
                    {isReschedule && slot.slotId === member.assignedSlotId && ' · 지금 일정'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {isReschedule && (
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
            disabled={isPending || selectedSlotId === null || keepsCurrentSchedule}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {isPending && <ButtonSpinner />}배정
          </button>
        </DialogFooter>
        <span role="status" className="sr-only">{isPending ? (isReschedule ? '일정 변경 중' : '수동 배정 중') : null}</span>
      </DialogContent>
    </Dialog>
  );
}
