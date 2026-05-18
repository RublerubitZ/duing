'use client';

import { useState } from 'react';
import type { ClubMember } from '@duing/types';

type TransferLeaderDialogProps = {
  target: ClubMember;
  clubName: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function TransferLeaderDialog({
  target,
  clubName,
  isPending,
  onConfirm,
  onCancel,
}: TransferLeaderDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  const canConfirm = typed.trim() === clubName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">회장 인계</h2>

        {step === 1 ? (
          <>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">{target.name}</p>
              <p className="text-xs text-slate-500">학번 {target.studentId} · {target.role}</p>
            </div>
            <p className="text-sm text-slate-600">
              회장을 인계하면 본인은 OFFICER 가 됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                다음
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              확인을 위해 동아리명{' '}
              <span className="font-medium text-slate-900">{clubName}</span> 를 그대로 입력해주세요.
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={clubName}
              disabled={isPending}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setStep(1); setTyped(''); }}
                disabled={isPending}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                이전
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canConfirm || isPending}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isPending ? '인계 중…' : '인계'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
