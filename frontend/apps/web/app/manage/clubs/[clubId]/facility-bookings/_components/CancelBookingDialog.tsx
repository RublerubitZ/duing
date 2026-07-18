'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

type Props = {
  open: boolean;
  isPending: boolean;
  errorMessage: string | null;
  summaryLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function CancelBookingDialog({ open, isPending, errorMessage, summaryLabel, onConfirm, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !isPending) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm" aria-describedby={undefined}>
        <DialogTitle>예약 신청을 취소할까요?</DialogTitle>
        <p className="text-sm text-charcoal-2">{summaryLabel}</p>
        <p className="text-xs text-charcoal-3">취소하면 되돌릴 수 없어요. 같은 시간이 필요하면 다시 신청해야 해요.</p>
        {errorMessage && (
          <p role="alert" className="text-xs text-coral">{errorMessage}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" disabled={isPending} onClick={onClose}>
            돌아가기
          </button>
          <button
            type="button"
            className="btn rounded-[10px] bg-coral text-white disabled:opacity-50"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending && <ButtonSpinner />}신청 취소
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
