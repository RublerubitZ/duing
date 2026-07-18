'use client';

import { useState } from 'react';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

type Props = {
  open: boolean;
  title: string;
  description: string;
  reasonLabel: string | null; // null = 사유 입력 없는 확인만(승인·수동 확정)
  isPending: boolean;
  errorMessage: string | null;
  destructive: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
};

export function BookingActionDialog({
  open,
  title,
  description,
  reasonLabel,
  isPending,
  errorMessage,
  destructive,
  onConfirm,
  onClose,
}: Props) {
  const [reason, setReason] = useState('');
  const reasonInvalid = reasonLabel !== null && (reason.trim().length === 0 || reason.trim().length > 500);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) {
          setReason('');
          onClose();
        }
      }}
    >
      <DialogContent
        className="w-[calc(100%-2rem)]"
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
        aria-describedby={undefined}
      >
        <DialogTitle>{title}</DialogTitle>
        <p className="text-sm text-charcoal-2">{description}</p>
        {reasonLabel !== null && (
          <textarea
            aria-label={reasonLabel}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder={`${reasonLabel}을(를) 입력해주세요 (500자 이내)`}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
          />
        )}
        {errorMessage && (
          <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-xs text-coral">
            {errorMessage}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost btn-sm" disabled={isPending} onClick={onClose}>
            돌아가기
          </button>
          <button
            type="button"
            className={`btn btn-sm ${destructive ? 'rounded-[10px] bg-coral text-white disabled:opacity-50' : 'btn-primary'}`}
            disabled={isPending || reasonInvalid}
            onClick={() => onConfirm(reason.trim())}
          >
            {isPending && <ButtonSpinner />}
            {title}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
