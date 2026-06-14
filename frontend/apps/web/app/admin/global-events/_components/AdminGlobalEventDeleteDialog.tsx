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
  onCancel: () => void;
  onConfirm: () => void;
};

export function AdminGlobalEventDeleteDialog({ title, isPending, onCancel, onConfirm }: Props) {
  if (!title) return null;
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
          <DialogTitle>이벤트 삭제</DialogTitle>
          <DialogDescription>
            &quot;<strong className="font-semibold text-ink">{title}</strong>&quot; 를 삭제하시겠어요? 캘린더에서 즉시 사라집니다.
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
            {isPending ? '삭제 중…' : '삭제'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
