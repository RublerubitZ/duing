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
  title: string | null;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminPromotionDeleteDialog({ title, isPending, onConfirm, onCancel }: Props) {
  if (!title) return null;
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
          <DialogTitle>배너를 삭제할까요?</DialogTitle>
          <DialogDescription>&quot;{title}&quot; 배너가 더 이상 노출되지 않습니다.</DialogDescription>
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
            {isPending ? '삭제 중…' : '삭제'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
