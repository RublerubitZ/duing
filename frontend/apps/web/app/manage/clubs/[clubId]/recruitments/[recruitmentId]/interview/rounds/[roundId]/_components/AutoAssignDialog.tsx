'use client';

import type { InterviewRoundStatus } from '@duing/types';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

// 자동배정 확인 모달 — COLLECTING 첫 실행(미응답 제외 경고)·ASSIGNING 재실행(재계산 경고) 분기.

type AutoAssignDialogProps = {
  status: InterviewRoundStatus;
  /** 배정에서 빠질 미응답 인원 — 마감 전 invitedCount · 마감 후 unrespondedCount */
  pendingCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
};

export function AutoAssignDialog({
  status,
  pendingCount,
  onConfirm,
  onCancel,
  isPending,
}: AutoAssignDialogProps) {
  const isRerun = status === 'ASSIGNING';

  const title = isRerun ? '자동배정 재실행' : '자동배정 실행';
  const description = isRerun
    ? '기존 배정이 다시 계산됩니다. 수동으로 지정한 배정도 갈아엎을 수 있습니다.'
    : pendingCount > 0
      ? `아직 응답하지 않은 ${pendingCount}명은 배정에서 빠집니다. 계속하시겠습니까?`
      : '자동배정을 실행하시겠습니까?';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {isPending && <ButtonSpinner />}
            {isRerun ? '재실행' : '배정 실행'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
