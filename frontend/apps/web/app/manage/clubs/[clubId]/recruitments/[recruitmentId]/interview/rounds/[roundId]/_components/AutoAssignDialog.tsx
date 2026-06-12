'use client';

import type { InterviewRoundStatus } from '@duing/types';

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-assign-dialog-title"
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="auto-assign-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <p className="text-sm text-slate-600">{description}</p>
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
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : isRerun ? '재실행' : '배정 실행'}
          </button>
        </div>
      </div>
    </div>
  );
}
