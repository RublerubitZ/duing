'use client';

import { useState } from 'react';
import { cn } from '../../../_lib/cn';
import type { AdminClubSummary } from '@duing/types';

type Props = {
  club: AdminClubSummary;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (closureReason?: string) => void;
  onCancel: () => void;
};

const REASON_MAX = 500;

export function AdminClubDeleteDialog({ club, isPending, errorMessage, onConfirm, onCancel }: Props) {
  const [nameInput, setNameInput] = useState('');
  const [reason, setReason] = useState('');

  const nameMatches = nameInput.trim() === club.name;
  const submitDisabled = isPending || !nameMatches;

  const handleSubmit = () => {
    if (submitDisabled) return;
    const trimmed = reason.trim();
    onConfirm(trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby="club-delete-title"
      aria-describedby="club-delete-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <header className="space-y-1">
          <h2 id="club-delete-title" className="text-base font-semibold text-slate-900">동아리 폐쇄</h2>
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{club.name}</span> 을(를) 폐쇄합니다.
          </p>
        </header>

        <div id="club-delete-desc" className="space-y-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <p className="font-semibold">되돌릴 수 없습니다.</p>
          <p className="text-xs">멤버십·진행 중인 모집·지원·면접·인증 요청·홍보가 모두 종료되고, 동아리가 모든 화면에서 사라집니다.</p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">동아리명 입력 확인</span>
          <input
            type="text"
            aria-label="동아리명 입력 확인"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder={club.name}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
          <span className="text-[11px] text-slate-400">폐쇄하려면 동아리명을 정확히 입력하세요.</span>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">폐쇄 사유 (선택)</span>
          <textarea
            aria-label="폐쇄 사유 (선택)"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
            rows={3}
            placeholder="폐쇄 사유를 입력하세요 (선택)"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
          <span className="block text-right text-[11px] text-slate-400">{reason.length} / {REASON_MAX}</span>
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
            disabled={submitDisabled}
            className={cn('rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50', 'bg-rose-600 hover:bg-rose-700')}
          >
            {isPending ? '처리 중…' : '폐쇄'}
          </button>
        </div>
      </div>
    </div>
  );
}
