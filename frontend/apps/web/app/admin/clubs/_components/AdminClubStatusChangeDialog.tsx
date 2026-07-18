'use client';

import { useState } from 'react';

import type { AdminClubSummary } from '@duing/types';

import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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

const fieldCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

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

  const confirmClass =
    action.tone === 'danger'
      ? 'btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50'
      : 'btn btn-primary btn-sm disabled:opacity-50';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-charcoal-2">{club.name}</span> ·{' '}
            {STATUS_LABEL[club.status]} → {STATUS_LABEL[action.nextStatus]}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-charcoal-2">{action.description}</p>

        {isRejection && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-charcoal-2">
              거절 사유 <span className="text-coral">*</span>
            </span>
            <textarea
              aria-label="거절 사유"
              aria-required
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
              required
              rows={4}
              placeholder="거절 사유를 입력하세요"
              className={fieldCls}
            />
            <p className="text-right text-[11px] text-charcoal-3">
              {reason.length} / {REASON_MAX}
            </p>
          </label>
        )}

        {errorMessage && (
          <p className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">{errorMessage}</p>
        )}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitDisabled} className={confirmClass}>
            {isPending && <ButtonSpinner />}{action.label}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
