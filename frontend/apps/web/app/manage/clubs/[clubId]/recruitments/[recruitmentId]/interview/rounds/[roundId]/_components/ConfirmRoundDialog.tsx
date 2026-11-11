'use client';

import { Fragment } from 'react';
import type { InterviewRoundDetailSlot, UnresolvedMembersPayload } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { MEMBER_STATUS_LABEL, MEMBER_STATUS_CLASS } from './memberStatusLabels';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';

// 확정 409 모달 — UnresolvedMembersPayload 의 미응답·응답했으나 미배정 두 그룹을 분리 렌더하고
// 강제 확정(force=true)을 제안한다. 강제 확정 실패 메시지는 모달 내부에 노출. 고른 슬롯에 빈 자리가 있는 미배정 응답자는 표시한다.

type ConfirmRoundDialogProps = {
  unresolvedPayload: UnresolvedMembersPayload;
  /** 라운드 상세의 슬롯 — 고른 슬롯에 지금 빈 자리가 있는지 판정. null = 상세를 다시 받는 중, 판정 보류 */
  slots: InterviewRoundDetailSlot[] | null;
  onForceConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  /** 강제 확정 실패 등 서버 에러 — 모달 내부에 표시 (전역 피드백으로 빠지지 않게) */
  errorMessage: string | null;
};

export function ConfirmRoundDialog({
  unresolvedPayload,
  slots,
  onForceConfirm,
  onCancel,
  isPending,
  errorMessage,
}: ConfirmRoundDialogProps) {
  const totalCount = unresolvedPayload.unresponded.length + unresolvedPayload.respondedUnassigned.length;
  // 고른 슬롯에 지금 빈 자리가 있으면 강제 확정으로 빼지 않고 수동 배정으로 살릴 수 있다 — 수동 배정 창은 슬롯을 시간으로만 보여 주므로 그 시간을 적는다.
  const freeSlots = (slots ?? []).filter((slot) => slot.assignedCount < slot.capacity);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-h-[85vh] max-w-md overflow-y-auto"
        busy={isPending}
      >
        <DialogHeader>
          <DialogTitle>미처리 지원자가 있습니다</DialogTitle>
          <DialogDescription>강제 확정 시 아래 {totalCount}명이 자동으로 제외됩니다.</DialogDescription>
        </DialogHeader>

        {unresolvedPayload.unresponded.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-charcoal-3">미응답</p>
            <ul className="space-y-1">
              {unresolvedPayload.unresponded.map((member) => (
                <li
                  key={member.applicationId}
                  className="flex items-center gap-2 rounded-md bg-graysoft px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-charcoal">{member.applicantName}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      MEMBER_STATUS_CLASS[member.memberStatus] ?? 'bg-graysoft text-charcoal-3',
                    )}
                  >
                    {MEMBER_STATUS_LABEL[member.memberStatus] ?? member.memberStatus}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {unresolvedPayload.respondedUnassigned.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-warm-deep">응답했으나 미배정</p>
            <ul className="space-y-1">
              {unresolvedPayload.respondedUnassigned.map((member) => {
                const freeSeatSlots = freeSlots.filter((slot) => member.selectedSlotIds.includes(slot.slotId));
                return (
                  <li
                    key={member.applicationId}
                    className="flex items-center justify-between gap-2 rounded-md border border-warm/40 bg-warm/10 px-3 py-1.5 text-sm"
                  >
                    {/* 이름·오른쪽 문구 모두 어절 단위로 접고(break-keep), 한 어절이 폭을 넘을 때만 글자 단위로 쪼갠다(anywhere — flex 최소 폭도 줄인다) — 줄바꿈은 오른쪽이 맡는다 */}
                    <span className="max-w-[40%] shrink-0 font-medium text-charcoal break-keep [overflow-wrap:anywhere]">
                      {member.applicantName}
                    </span>
                    <span className="text-right text-xs text-warm-deep break-keep [overflow-wrap:anywhere]">
                      {`선택 슬롯 ${member.selectedSlotIds.length}개`}
                      {freeSeatSlots.length > 0 && (
                        <>
                          {' · 고른 시간에 빈 자리 있음('}
                          {freeSeatSlots.map((slot, slotIndex) => (
                            <Fragment key={slot.slotId}>
                              {slotIndex > 0 && ', '}
                              <span className="whitespace-nowrap">{formatSlotRange(slot.startTime, slot.endTime)}</span>
                            </Fragment>
                          ))}
                          )
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
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
            onClick={onForceConfirm}
            disabled={isPending}
            className="btn btn-sm btn-danger disabled:opacity-50"
          >
            {isPending && <ButtonSpinner />}강제 확정 (미처리 {totalCount}명 제외)
          </button>
        </DialogFooter>
        <span role="status" className="sr-only">{isPending ? '라운드 확정 중' : null}</span>
      </DialogContent>
    </Dialog>
  );
}
