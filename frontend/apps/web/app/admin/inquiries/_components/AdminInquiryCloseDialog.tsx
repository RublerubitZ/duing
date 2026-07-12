'use client';

import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type Props = {
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (closedReason: string | undefined) => void;
  onCancel: () => void;
};

const CLOSE_REASON_MAX_LENGTH = 200;

const reasonInputCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AdminInquiryCloseDialog({ isPending, errorMessage, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    onConfirm(reason.trim() || undefined);
  };

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
          <DialogTitle>문의를 종료할까요?</DialogTitle>
          <DialogDescription>종료 후에는 이 문의에 추가로 답변을 남길 수 없습니다.</DialogDescription>
        </DialogHeader>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-charcoal-2">종료 사유 (선택)</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, CLOSE_REASON_MAX_LENGTH))}
            placeholder="종료 사유를 입력하세요"
            className={reasonInputCls}
          />
          <p className="text-right text-[11px] text-charcoal-3">
            {reason.length} / {CLOSE_REASON_MAX_LENGTH}
          </p>
        </label>

        {errorMessage && <p className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">{errorMessage}</p>}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
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
