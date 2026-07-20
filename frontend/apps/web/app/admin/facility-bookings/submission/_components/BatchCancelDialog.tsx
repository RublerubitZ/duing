'use client';

import type { SubmissionBatchSummary } from '@duing/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

type Props = {
  batch: SubmissionBatchSummary | null;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * 제출 목록 취소 확인(스펙 v3 §7.3) — 되돌릴 수 없는 파괴적 조작이라 CancelBookingDialog 전례처럼
 * 결과를 3문단으로 나눠 안내한다(사용 불가 → 예약 원복 → 되돌릴 수 없음). open 은 batch 유무로 파생.
 */
export function BatchCancelDialog({ batch, isPending, onConfirm, onClose }: Props) {
  return (
    <Dialog open={batch !== null} onOpenChange={(nextOpen) => { if (!nextOpen && !isPending) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm" aria-describedby={undefined}>
        <DialogTitle>제출 목록을 취소할까요?</DialogTitle>
        <p className="text-sm text-charcoal-2">취소하면 이 제출 목록은 사용할 수 없게 됩니다.</p>
        <p className="text-sm text-charcoal-2">
          {"담긴 예약은 다시 '학교에 제출할 예약' 목록으로 돌아갑니다."}
        </p>
        <p className="text-xs text-charcoal-3">이 작업은 되돌릴 수 없습니다. CSV 는 취소 후에도 다시 받을 수 있어요.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" disabled={isPending} onClick={onClose}>
            돌아가기
          </button>
          <button
            type="button"
            className="btn rounded-[10px] bg-coral text-white disabled:opacity-50"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending && <ButtonSpinner />}제출 목록 취소
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
