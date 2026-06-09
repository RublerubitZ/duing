'use client';

import type { BulkUpdateApplicationStatusPayload } from '@duing/types';

type TargetStatus = BulkUpdateApplicationStatusPayload['status'];

// INTERVIEW_PENDING 전이는 BulkPromoteDialog (Spec P0-4) 가 전담한다.
// 본 컴포넌트는 그 외 UNDER_REVIEW / ACCEPTED / REJECTED 전이만 처리.
type GenericTargetStatus = Exclude<TargetStatus, 'INTERVIEW_PENDING'>;

type Props = {
  targetStatus: GenericTargetStatus;
  selectedCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const LABEL: Record<GenericTargetStatus, string> = {
  UNDER_REVIEW: '서류 검토 중',
  ACCEPTED: '합격',
  REJECTED: '불합격',
};

const DESCRIPTION: Record<GenericTargetStatus, string> = {
  UNDER_REVIEW: '선택한 지원자를 서류 검토 중 상태로 일괄 변경합니다.',
  ACCEPTED:
    '선택한 지원자가 동아리 회원으로 자동 등록되며, 알림이 발송될 수 있습니다.',
  REJECTED: '되돌릴 수 없습니다. 잘못 누른 항목이 있으면 취소하고 선택을 다시 확인하세요.',
};

const CONFIRM_BUTTON_CLASS: Record<GenericTargetStatus, string> = {
  UNDER_REVIEW:
    'rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50',
  ACCEPTED:
    'rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50',
  REJECTED:
    'rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50',
};

export function BulkConfirmDialog({
  targetStatus,
  selectedCount,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="bulk-confirm-title"
      aria-describedby="bulk-confirm-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="bulk-confirm-title" className="text-base font-semibold text-slate-900">
          {selectedCount}건을 일괄 {LABEL[targetStatus]} 처리할까요?
        </h2>
        <p id="bulk-confirm-desc" className="text-sm text-slate-600">
          {DESCRIPTION[targetStatus]}{' '}
          현재 상태에서 전이가 불가능한 항목은 자동으로 건너뜁니다.
        </p>
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
            className={CONFIRM_BUTTON_CLASS[targetStatus]}
          >
            {isPending ? '처리 중…' : LABEL[targetStatus]}
          </button>
        </div>
      </div>
    </div>
  );
}
