'use client';

import { cn } from '@/app/_lib/cn';

// 범용 확인 모달 — 라운드 취소·멤버 제외 등 단순 확인 흐름에 공용.

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  destructive?: boolean;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  isPending = false,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
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
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50',
              destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-purple-600 hover:bg-purple-700',
            )}
          >
            {isPending ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
