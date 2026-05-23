'use client';

import { useState } from 'react';
import type { AdminSuccessionDetail, ProcessSuccessionPayload, SuccessionStatus } from '@duing/types';
import { cn } from '../../../_lib/cn';

type Props = {
  succession: AdminSuccessionDetail;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (payload: ProcessSuccessionPayload) => void;
  onCancel: () => void;
};

const ACTION_NOTE_MAX = 1000;
const TERMINAL_STATUSES: Exclude<SuccessionStatus, 'PENDING'>[] = ['APPROVED', 'REJECTED'];
const STATUS_LABEL_MAP: Record<Exclude<SuccessionStatus, 'PENDING'>, string> = {
  APPROVED: '승인',
  REJECTED: '거절',
};

export function AdminSuccessionProcessDialog({ succession, isPending, errorMessage, onConfirm, onCancel }: Props) {
  const [selectedStatus, setSelectedStatus] = useState<Exclude<SuccessionStatus, 'PENDING'>>('APPROVED');
  const [actionNote, setActionNote] = useState('');

  const handleSubmit = () => {
    const payload: ProcessSuccessionPayload = {
      status: selectedStatus,
      actionNote: actionNote.trim() || undefined,
    };
    onConfirm(payload);
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby="process-succession-title"
      aria-describedby="process-succession-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <header className="space-y-1">
          <h2 id="process-succession-title" className="text-base font-semibold text-slate-900">
            승계 요청 처리
          </h2>
          <p id="process-succession-desc" className="text-xs text-slate-500">
            요청 #<span className="font-medium text-slate-700">{succession.id}</span> —{' '}
            {succession.club.name}
          </p>
        </header>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-slate-700">처리 결과 선택</legend>
          <div className="flex gap-4">
            {TERMINAL_STATUSES.map((statusOption) => (
              <label
                key={statusOption}
                className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
              >
                <input
                  type="radio"
                  name="successionStatus"
                  value={statusOption}
                  checked={selectedStatus === statusOption}
                  onChange={() => setSelectedStatus(statusOption)}
                />
                {STATUS_LABEL_MAP[statusOption]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">처리 메모 (선택)</span>
          <textarea
            value={actionNote}
            onChange={(event) => setActionNote(event.target.value.slice(0, ACTION_NOTE_MAX))}
            rows={4}
            placeholder="처리 메모를 입력하세요"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
          <p className="text-right text-[11px] text-slate-400">
            {actionNote.length} / {ACTION_NOTE_MAX}
          </p>
        </label>

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
            disabled={isPending}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50',
              selectedStatus === 'APPROVED'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-rose-600 hover:bg-rose-700',
            )}
          >
            {isPending ? '처리 중…' : `${STATUS_LABEL_MAP[selectedStatus]}으로 처리`}
          </button>
        </div>
      </div>
    </div>
  );
}
