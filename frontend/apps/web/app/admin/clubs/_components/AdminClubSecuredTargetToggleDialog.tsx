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

/**
 * 기본 확보 시간 대상 토글 확인 다이얼로그 — 중앙동아리 토글(AdminClubCentralClubToggleDialog) 전례.
 * ON 이면 이 동아리의 시설 크롤 예약이 즉시 BASIC_SECURED_TIME 으로 분류된다(재크롤 불요·차단은 동일).
 */
export function AdminClubSecuredTargetToggleDialog({
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
          <DialogTitle>기본 확보 시간 대상 {action}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-charcoal-2">{clubName}</span> 을(를) 기본 확보 시간
            대상으로 {action}하시겠습니까?{' '}
            {currentValue
              ? '해제하면 이 동아리의 학교 크롤 예약이 일반 크롤 예약으로 표시됩니다(차단은 유지).'
              : '지정하면 이 동아리의 학교 크롤 예약이 기본 확보 시간으로 표시됩니다(시간은 크롤 실범위 그대로, 차단은 동일).'}
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
