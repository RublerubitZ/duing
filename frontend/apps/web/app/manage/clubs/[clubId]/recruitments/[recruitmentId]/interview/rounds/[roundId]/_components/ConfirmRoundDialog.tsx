'use client';

import type { UnresolvedMembersPayload } from '@duing/types';

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

// 확정 409 모달 — UnresolvedMembersPayload 의 미응답·응답했으나 미배정 두 그룹을 분리 렌더하고
// 강제 확정(force=true)을 제안한다. 강제 확정 실패 메시지는 모달 내부에 노출.

type ConfirmRoundDialogProps = {
  unresolvedPayload: UnresolvedMembersPayload;
  onForceConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  /** 강제 확정 실패 등 서버 에러 — 모달 내부에 표시 (전역 피드백으로 빠지지 않게) */
  errorMessage: string | null;
};

export function ConfirmRoundDialog({
  unresolvedPayload,
  onForceConfirm,
  onCancel,
  isPending,
  errorMessage,
}: ConfirmRoundDialogProps) {
  const totalCount = unresolvedPayload.unresponded.length + unresolvedPayload.respondedUnassigned.length;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>미처리 멤버가 있습니다</DialogTitle>
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
            <p className="mb-1 text-xs font-semibold text-[#8e6620]">응답했으나 미배정</p>
            <ul className="space-y-1">
              {unresolvedPayload.respondedUnassigned.map((member) => (
                <li
                  key={member.applicationId}
                  className="flex items-center justify-between rounded-md border border-warm/40 bg-warm/10 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-charcoal">{member.applicantName}</span>
                  <span className="text-xs text-[#8e6620]">선택 슬롯 {member.selectedSlotIds.length}개</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="rounded-md border border-coral/20 bg-coral/5 px-3 py-2 text-sm text-coral">
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
            className="btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {isPending ? '처리 중…' : `강제 확정 (미처리 ${totalCount}명 제외)`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
