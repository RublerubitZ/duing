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

type Props = {
  clubName: string | null;
  currentValue: boolean;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminClubCentralClubToggleDialog({
  clubName,
  currentValue,
  isPending,
  errorMessage,
  onConfirm,
  onCancel,
}: Props) {
  if (clubName === null) return null;
  const action = currentValue ? '해제' : '지정';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>중앙동아리 {action}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-charcoal-2">{clubName}</span> 을(를) 중앙동아리로 {action}하시겠습니까?
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <p className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">{errorMessage}</p>
        )}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {isPending && <ButtonSpinner />}확인
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
