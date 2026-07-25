'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

type RemoveMemberDialogProps = {
  targetName: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RemoveMemberDialog({ targetName, isPending, onConfirm, onCancel }: RemoveMemberDialogProps) {
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
          <DialogTitle>회원 탈퇴</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-charcoal-2">{targetName}</span> 님을 동아리에서 탈퇴 처리할까요? 되돌릴 수 없으며, 진행 중인 지원서는 그대로 유지됩니다.
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
            {isPending && <ButtonSpinner />}탈퇴
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
