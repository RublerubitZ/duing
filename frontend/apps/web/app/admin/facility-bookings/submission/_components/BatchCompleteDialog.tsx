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
 * 학교 제출 완료 확인(스펙 v3 §7.3) — 완료하면 예약이 학교 등록 완료로 넘어가고 다시 취소할 수 없어,
 * 안내 3줄로 결과를 미리 알린다. 펜딩 중 확인·돌아가기 잠금 + onOpenChange 가드(BatchCreateDialog 전례).
 */
export function BatchCompleteDialog({ batch, isPending, onConfirm, onClose }: Props) {
  return (
    <Dialog open={batch !== null} onOpenChange={(nextOpen) => { if (!nextOpen && !isPending) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm" aria-describedby={undefined}>
        <DialogTitle>학교 제출을 완료하시겠습니까?</DialogTitle>
        <div className="space-y-1 text-sm text-charcoal-2">
          <p>• 제출 가능한 예약은 학교 등록 완료 상태로 변경됩니다.</p>
          <p>• 이미 취소되었거나 상태가 변경된 예약은 자동으로 제외됩니다.</p>
          <p>• 완료된 제출 목록은 다시 취소할 수 없습니다.</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" disabled={isPending} onClick={onClose}>
            돌아가기
          </button>
          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending && <ButtonSpinner />}제출 완료
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
