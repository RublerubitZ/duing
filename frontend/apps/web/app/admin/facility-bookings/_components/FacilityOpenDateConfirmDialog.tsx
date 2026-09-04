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
  /** 변경 대상 — 시설명 또는 "활성 시설 N개". */
  title: string;
  /** 이전 값(날짜 · "닫힘" · 전체 적용이면 "여러 값"). */
  before: string;
  /** 이후 값(날짜 또는 "닫힘"). */
  after: string;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 예약 오픈일 변경 확인 다이얼로그 — AdminClubSecuredTargetToggleDialog 전례를 따른다.
 * 오픈일은 그 시설의 신청 가능 여부를 그대로 바꾸고(닫힘이면 신청 불가), 전체 적용은 활성 시설 전부를
 * 한 트랜잭션으로 덮으므로 이전 → 이후를 눈으로 확인시킨 뒤 보낸다.
 */
export function FacilityOpenDateConfirmDialog({
  title,
  before,
  after,
  isPending,
  errorMessage,
  onConfirm,
  onCancel,
}: Props) {
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            예약 오픈일을 <span className="font-medium text-charcoal-2">{before}</span> →{' '}
            <span className="font-medium text-charcoal-2">{after}</span> 로 바꿀까요?
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
