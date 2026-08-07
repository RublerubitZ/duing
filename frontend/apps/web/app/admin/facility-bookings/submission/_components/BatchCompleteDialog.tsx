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
 * 안내 3줄로 결과를 미리 알린다. 펜딩 중 확인·돌아가기 잠금 + onOpenChange 가드(BatchBulkCreateDialog 전례).
 */
export function BatchCompleteDialog({ batch, isPending, onConfirm, onClose }: Props) {
  return (
    <Dialog open={batch !== null} onOpenChange={(nextOpen) => { if (!nextOpen && !isPending) onClose(); }}>
      <DialogContent busy={isPending} className="w-[calc(100%-2rem)] max-w-sm rounded-[22px]" aria-describedby={undefined}>
        {/* 목업 SubmitCompleteDialog — sage-mist 체크 타일 + 큰 타이틀. */}
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-sage-mist">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6 text-ink-deep"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <DialogTitle className="text-[21px] font-extrabold leading-snug text-ink-deep">학교 제출을 완료하시겠습니까?</DialogTitle>
        {/* 두 행위 구분 경고(개편 스펙 §5) — 오프라인 제출과 시스템 완료 처리를 혼동한 조기 완료를 막는다. */}
        <div className="flex gap-2 rounded-md bg-[#FBEFD7] px-3 py-2 text-xs leading-relaxed text-[#8E6620]">
          <span aria-hidden>⚠️</span>
          <p>
            <strong>학교 제출(오프라인)</strong>과 <strong>시스템 완료 처리</strong>는 별개입니다. 실제 행정실
            제출을 마친 뒤에 진행하세요.
          </p>
        </div>
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
            {isPending && <ButtonSpinner />}완료 처리
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
