'use client';

import { useState } from 'react';
import { cn } from '../../../_lib/cn';
import type { AdminClubSummary } from '@duing/types';
import { STATUS_LABEL, type StatusAction } from '../_lib/clubStatus';

type Props = {
  club: AdminClubSummary;
  action: StatusAction;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (rejectionReason?: string) => void;
  onCancel: () => void;
};

const REASON_MAX = 500;

export function AdminClubStatusChangeDialog({
  club,
  action,
  isPending,
  errorMessage,
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState('');
  const isRejection = action.nextStatus === 'REJECTED';
  const trimmedEmpty = reason.trim().length === 0;
  const submitDisabled = isPending || (isRejection && trimmedEmpty);

  const handleSubmit = () => {
    if (isRejection) {
      if (trimmedEmpty) return;
      onConfirm(reason.trim());
    } else {
      onConfirm(undefined);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby="status-change-title"
      aria-describedby="status-change-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <header className="space-y-1">
          <h2 id="status-change-title" className="text-base font-semibold text-slate-900">
            {action.label}
          </h2>
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{club.name}</span> ·{' '}
            {STATUS_LABEL[club.status]} → {STATUS_LABEL[action.nextStatus]}
          </p>
        </header>

        <p id="status-change-desc" className="text-sm text-slate-600">
          {action.description}
        </p>

        {isRejection && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">
              거절 사유 <span className="text-rose-600">*</span>
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
              required
              rows={4}
              placeholder="거절 사유를 입력하세요"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
            <p className="text-right text-[11px] text-slate-400">
              {reason.length} / {REASON_MAX}
            </p>
          </label>
        )}

        {errorMessage && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
        )}

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
            onClick={handleSubmit}
            disabled={submitDisabled}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50',
              action.tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-emerald-600 hover:bg-emerald-700',
            )}
          >
            {isPending ? '처리 중…' : action.label}
          </button>
        </div>
      </div>
    </div>
  );
}
