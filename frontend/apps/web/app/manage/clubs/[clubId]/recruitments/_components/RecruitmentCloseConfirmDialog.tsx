'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

type Props = {
  /** 이번 등록으로 마감 처리될 기존 모집의 제목. */
  recruitmentTitle: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 새 모집 등록이 기존 OPEN 모집을 자동 마감하기 전 확인 다이얼로그
 * (아카이브 스펙 §9 — lazy-close 리뷰 프리즈 고지).
 *
 * 마감되면 그 모집의 지원현황이 조회 전용으로 굳고 심사 액션이 일괄 409 로 전환된다. 되돌릴 수 없는
 * 전환인데 지금까지는 예고가 없었으므로 제출 직전에 한 번 묻는다.
 * 골격(취소 정책·isPending 가드)은 StatusConfirmDialog / BulkConfirmDialog 와 동일하게 유지.
 */
export function RecruitmentCloseConfirmDialog({
  recruitmentTitle,
  isPending,
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
        className="max-w-md"
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>기존 모집을 마감하시겠습니까?</DialogTitle>
          <DialogDescription>
            새 모집을 등록하면 현재 진행 중인 모집 &apos;{recruitmentTitle}&apos; 이 마감 처리됩니다.
          </DialogDescription>
        </DialogHeader>

        <p className="text-[13px] leading-relaxed text-charcoal-2">
          마감된 모집은 지원현황이 조회 전용으로 전환되며, 지원 상태 변경, 평가, 면접 라운드 생성이
          불가능합니다.
        </p>
        <p className="text-[13px] leading-relaxed text-charcoal-2">계속하시겠습니까?</p>

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="btn btn-ghost btn-sm"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {isPending && <ButtonSpinner />}
            등록 및 마감
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
