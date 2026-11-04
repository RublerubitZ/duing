'use client';

import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

import { pendingCleanupDialogLines, type PendingCleanupCounts } from '../_lib/pendingCleanup';

type Props = {
  clubName: string;
  counts: PendingCleanupCounts;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminClubPendingCleanupDialog({ clubName, counts, isPending, errorMessage, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent busy={isPending}>
        <DialogHeader>
          <DialogTitle className="break-keep">{clubName}의 남은 미결을 정리할까요?</DialogTitle>
          {/* Description 은 p 라 목록을 담지 못한다 — asChild 로 ul 이 창 설명이 된다. */}
          <DialogDescription
            asChild
            className="space-y-1 break-keep rounded-md bg-coral/5 px-3 py-2 text-sm text-coral-deep"
          >
            <ul>
              {pendingCleanupDialogLines(counts).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral-deep">{errorMessage}</p>
        )}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn btn-sm btn-danger disabled:opacity-50"
          >
            {isPending && <ButtonSpinner />}
            {isPending ? '정리하는 중…' : '정리하기'}
          </button>
        </DialogFooter>
        <span role="status" className="sr-only">{isPending ? '남은 미결 정리 중' : null}</span>
      </DialogContent>
    </Dialog>
  );
}
