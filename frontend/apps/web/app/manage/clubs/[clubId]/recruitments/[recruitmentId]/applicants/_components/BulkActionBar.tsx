'use client';

import type { ApplicationStatus } from '@duing/types';

type BulkActionBarProps = {
  selectedCount: number;
  isPending: boolean;
  onConfirm: (status: Extract<ApplicationStatus, 'ACCEPTED' | 'REJECTED'>) => void;
  onClear: () => void;
};

export function BulkActionBar({ selectedCount, isPending, onConfirm, onClear }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="일괄 처리 액션"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <div className="text-sm font-medium text-slate-700">
          선택 <span className="font-bold text-slate-900">{selectedCount}</span>건
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            선택 해제
          </button>
          <button
            type="button"
            onClick={() => onConfirm('REJECTED')}
            disabled={isPending}
            className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            일괄 불합격
          </button>
          <button
            type="button"
            onClick={() => onConfirm('ACCEPTED')}
            disabled={isPending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            일괄 합격
          </button>
        </div>
      </div>
    </div>
  );
}
