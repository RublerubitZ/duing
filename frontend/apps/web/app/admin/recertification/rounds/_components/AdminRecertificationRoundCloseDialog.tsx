'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type Props = {
  roundLabel: string | null;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminRecertificationRoundCloseDialog({ roundLabel, isPending, onConfirm, onCancel }: Props) {
  if (!roundLabel) return null;
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
          <DialogTitle>라운드를 종료할까요?</DialogTitle>
          <DialogDescription>
            &quot;{roundLabel}&quot; 라운드를 종료하면 더 이상 재인증 제출을 받을 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {isPending ? '종료 중…' : '종료'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
