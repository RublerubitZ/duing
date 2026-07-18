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

type Props = {
  club: AdminClubSummary;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (closureReason?: string) => void;
  onCancel: () => void;
};

const REASON_MAX = 500;

const fieldCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AdminClubDeleteDialog({ club, isPending, errorMessage, onConfirm, onCancel }: Props) {
  const [nameInput, setNameInput] = useState('');
  const [reason, setReason] = useState('');

  const nameMatches = nameInput.trim() === club.name;
  const submitDisabled = isPending || !nameMatches;

  const handleSubmit = () => {
    if (submitDisabled) return;
    const trimmed = reason.trim();
    onConfirm(trimmed.length > 0 ? trimmed : undefined);
  };

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
          <DialogTitle>동아리 삭제</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-charcoal-2">{club.name}</span> 을(를) 삭제합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
          <p className="font-semibold">되돌릴 수 없습니다.</p>
          <p className="text-xs">멤버십·진행 중인 모집·지원·면접·인증 요청·홍보가 모두 종료되고, 동아리가 모든 화면에서 사라집니다.</p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-charcoal-2">동아리명 입력 확인</span>
          <input
            type="text"
            aria-label="동아리명 입력 확인"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder={club.name}
            className={fieldCls}
          />
          <span className="text-[11px] text-charcoal-3">삭제하려면 동아리명을 정확히 입력하세요.</span>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-charcoal-2">삭제 사유 (선택)</span>
          <textarea
            aria-label="삭제 사유 (선택)"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
            rows={3}
            placeholder="삭제 사유를 입력하세요 (선택)"
            className={fieldCls}
          />
          <span className="block text-right text-[11px] text-charcoal-3">{reason.length} / {REASON_MAX}</span>
        </label>

        {errorMessage && (
          <p className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">{errorMessage}</p>
        )}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {isPending && <ButtonSpinner />}삭제
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
