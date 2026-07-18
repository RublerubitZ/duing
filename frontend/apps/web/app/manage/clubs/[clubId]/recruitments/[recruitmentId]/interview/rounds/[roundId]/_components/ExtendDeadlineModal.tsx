'use client';

import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

// 마감 연장 모달 — COLLECTING 한정. 연장만 가능(단축 거부)하며 서버 거부 메시지는 모달 내부에 노출.

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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-sm"
        aria-describedby={undefined}
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>마감 연장</DialogTitle>
        </DialogHeader>

        <p className="rounded-md border border-warm/40 bg-warm/10 px-3 py-2 text-sm text-[#8e6620]">
          마감 일시는 현재보다 연장만 가능합니다.
        </p>
        <div>
          <label htmlFor="extend-deadline" className="block text-sm font-medium text-charcoal-2">
            마감 일시
          </label>
          <input
            id="extend-deadline"
            type="datetime-local"
            value={newDeadline}
            onChange={(event) => setNewDeadline(event.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-charcoal transition-colors focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        {errorMessage && (
          <div role="alert" className="rounded-md border border-coral/20 bg-coral/5 px-3 py-2 text-sm text-coral">
            {errorMessage}
          </div>
        )}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={() => newDeadline && onSave(newDeadline)}
            disabled={isPending || !newDeadline}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {isPending && <ButtonSpinner />}저장
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
