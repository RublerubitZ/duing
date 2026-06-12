'use client';

import { useState } from 'react';

// 마감 연장 모달 — COLLECTING 한정. 연장만 가능(단축 거부)하며 서버 거부 메시지는 모달 내부 alert 로 노출.

type ExtendDeadlineModalProps = {
  currentDeadline: string | null;
  onSave: (deadline: string) => void;
  onCancel: () => void;
  isPending: boolean;
  /** 단축 거부 등 서버 에러 — 모달 내부에 표시 (전역 피드백으로 빠지지 않게) */
  errorMessage: string | null;
};

export function ExtendDeadlineModal({
  currentDeadline,
  onSave,
  onCancel,
  isPending,
  errorMessage,
}: ExtendDeadlineModalProps) {
  const [newDeadline, setNewDeadline] = useState(currentDeadline ?? '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="extend-deadline-modal-title"
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="extend-deadline-modal-title" className="text-base font-semibold text-slate-900">
          마감 연장
        </h2>
        <p className="text-sm text-amber-700 rounded-md bg-amber-50 px-3 py-2">
          마감 일시는 현재보다 연장만 가능합니다.
        </p>
        <div>
          <label htmlFor="extend-deadline" className="block text-sm font-medium text-slate-700">
            마감 일시
          </label>
          <input
            id="extend-deadline"
            type="datetime-local"
            value={newDeadline}
            onChange={(event) => setNewDeadline(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        {errorMessage && (
          <div
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {errorMessage}
          </div>
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
            onClick={() => newDeadline && onSave(newDeadline)}
            disabled={isPending || !newDeadline}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
