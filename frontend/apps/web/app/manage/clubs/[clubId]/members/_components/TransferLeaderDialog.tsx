'use client';

import { useState } from 'react';

import type { ClubMember } from '@duing/types';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type TransferLeaderDialogProps = {
  target: ClubMember;
  clubName: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const fieldCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>회장 인계</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <>
            <div className="rounded-md border border-line bg-graysoft p-3">
              <p className="text-sm font-medium text-charcoal">{target.name}</p>
              <p className="text-xs text-charcoal-3">학번 {target.studentId} · {target.role}</p>
            </div>
            <DialogDescription className="text-sm text-charcoal-2">
              회장을 인계하면 본인은 OFFICER 가 됩니다. 되돌릴 수 없습니다.
            </DialogDescription>
            <DialogFooter>
              <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
                취소
              </button>
              <button type="button" onClick={() => setStep(2)} className="btn btn-primary btn-sm">
                다음
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogDescription className="text-sm text-charcoal-2">
              확인을 위해 동아리명 <span className="font-medium text-charcoal">{clubName}</span> 를 그대로 입력해주세요.
            </DialogDescription>
            <input
              type="text"
              aria-label="동아리명 입력 확인"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={clubName}
              disabled={isPending}
              className={fieldCls}
            />
            <DialogFooter>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setTyped('');
                }}
                disabled={isPending}
                className="btn btn-ghost btn-sm"
              >
                이전
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canConfirm || isPending}
                className="btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
              >
                {isPending ? '인계 중…' : '인계'}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
