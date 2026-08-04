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

// 스펙 §5-3 — 운영진 지원자 상세의 단건 최종 상태(합격/불합격) 확인 모달.
// ON_HOLD / INTERVIEW_PENDING 은 가역·비최종이라 StatusActionBar 에서 확인 없이 즉시 처리한다.
// 골격(취소 정책·isPending 가드)은 BulkConfirmDialog 와 동일하게 유지.

type FinalStatus = 'ACCEPTED' | 'REJECTED';

type Props = {
  targetStatus: FinalStatus;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const TITLE: Record<FinalStatus, string> = {
  ACCEPTED: '합격 처리하시겠습니까?',
  REJECTED: '불합격 처리하시겠습니까?',
};

const DESCRIPTION: Record<FinalStatus, string> = {
  ACCEPTED: '합격 처리 후에는 지원자에게 결과가 반영되며, 동아리 회원으로 자동 등록됩니다.',
  REJECTED: '불합격 처리 후에는 지원자에게 결과가 반영됩니다. 되돌릴 수 없습니다.',
};

const CONFIRM_LABEL: Record<FinalStatus, string> = {
  ACCEPTED: '합격 처리',
  REJECTED: '불합격 처리',
};

// 불합격만 위험(coral), 합격은 기본(ink) — BulkConfirmDialog 와 같은 정책.
const CONFIRM_BUTTON_CLASS: Record<FinalStatus, string> = {
  ACCEPTED: 'btn btn-primary btn-sm disabled:opacity-50',
  REJECTED: 'btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50',
};

export function StatusConfirmDialog({ targetStatus, isPending, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{TITLE[targetStatus]}</DialogTitle>
          <DialogDescription>{DESCRIPTION[targetStatus]}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={CONFIRM_BUTTON_CLASS[targetStatus]}
          >
            {isPending && <ButtonSpinner />}
            {CONFIRM_LABEL[targetStatus]}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
