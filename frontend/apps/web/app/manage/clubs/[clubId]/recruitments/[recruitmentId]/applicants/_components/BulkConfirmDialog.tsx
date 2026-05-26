'use client';

import type { ApplicationStatus } from '@duing/types';

type Props = {
  targetStatus: Extract<ApplicationStatus, 'ACCEPTED' | 'REJECTED'>;
  selectedCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const LABEL: Record<'ACCEPTED' | 'REJECTED', string> = {
  ACCEPTED: '합격',
  REJECTED: '불합격',
};

export function BulkConfirmDialog({ targetStatus, selectedCount, isPending, onConfirm, onCancel }: Props) {
  const isAccept = targetStatus === 'ACCEPTED';

  return (
    <div
      role="alertdialog"
      aria-labelledby="bulk-confirm-title"
      aria-describedby="bulk-confirm-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
    >
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <h2 id="bulk-confirm-title" className="text-base font-semibold text-slate-900">
          {selectedCount}건을 일괄 {LABEL[targetStatus]} 처리할까요?
        </h2>
        <p id="bulk-confirm-desc" className="text-sm text-slate-600">
          {isAccept
            ? '선택한 지원자가 동아리 회원으로 자동 등록되며, 알림이 발송될 수 있습니다.'
            : '되돌릴 수 없습니다. 잘못 누른 항목이 있으면 취소하고 선택을 다시 확인하세요.'}
          {' '}현재 상태에서 전이가 불가능한 항목은 자동으로 건너뜁니다.
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
            className={
              isAccept
                ? 'rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50'
                : 'rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50'
            }
          >
            {isPending ? '처리 중…' : LABEL[targetStatus]}
          </button>
        </div>
      </div>
    </div>
  );
}
