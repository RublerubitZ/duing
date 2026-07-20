'use client';

import Link from 'next/link';
import { useDownloadSubmissionCsvMutation } from '@duing/hooks';
import type { CreateSubmissionBatchResult } from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { downloadBlobFile } from '@/app/_lib/downloadFile';
import { toRoute } from '@/app/_lib/route';
import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { submissionCsvFileName } from '../_lib/submissionBatches';

export type BulkCreateOutcome = {
  facilityId: number;
  facilityName: string;
  bookingCount: number;
  batch: CreateSubmissionBatchResult | null; // null = 생성 실패
  errorMessage: string | null;
};

type Props = {
  outcomes: BulkCreateOutcome[];
  onClose: () => void;
};

/**
 * 생성 결과 다이얼로그(개편 스펙 §4) — 생성 직후 배치별 CSV 를 바로 받게 해
 * "탭 이동 → 배치 찾기 → CSV" 동선을 없앤다. 부분 실패는 시설별로 구분 보고한다.
 */
export function BatchBulkCreateResultDialog({ outcomes, onClose }: Props) {
  const csvMutation = useDownloadSubmissionCsvMutation();
  const { addToast } = useToast();

  const successCount = outcomes.filter((outcome) => outcome.batch !== null).length;
  const failureCount = outcomes.length - successCount;

  const handleDownloadCsv = async (batch: CreateSubmissionBatchResult) => {
    try {
      const csvBlob = await csvMutation.mutateAsync({ batchId: batch.batchId });
      downloadBlobFile(submissionCsvFileName(batch.submissionNo), csvBlob);
    } catch {
      addToast('CSV 다운로드에 실패했어요. 잠시 후 다시 시도해 주세요.', { variant: 'error' });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-[22px]">
        <DialogHeader>
          <DialogTitle className="text-[21px] font-extrabold leading-snug text-ink-deep">
            {failureCount === 0
              ? `제출 목록 ${successCount}개가 만들어졌어요`
              : successCount === 0
                ? '제출 목록을 만들지 못했어요'
                : '일부 제출 목록을 만들지 못했어요'}
          </DialogTitle>
          <DialogDescription>
            {failureCount === 0
              ? 'CSV 를 바로 받아 제출 서류를 준비할 수 있어요.'
              : '실패한 시설의 예약은 계속 선택돼 있어요 — 잠시 후 다시 시도해 주세요.'}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {outcomes.map((outcome) => (
            <li
              key={outcome.facilityId}
              className={`flex flex-wrap items-center gap-2 rounded-md px-3 py-2 ${
                outcome.batch !== null ? 'bg-sage/10' : 'bg-coral/10'
              }`}
            >
              <span aria-hidden className={outcome.batch !== null ? 'text-ink' : 'text-coral'}>
                {outcome.batch !== null ? '✓' : '!'}
              </span>
              {/* 아이콘·배경색은 장식 — 스크린리더용 성공/실패 라벨을 텍스트로 남긴다. */}
              <span className="sr-only">{outcome.batch !== null ? '생성 성공' : '생성 실패'}</span>
              <span className="text-sm font-medium text-ink-deep">{outcome.facilityName}</span>
              {outcome.batch !== null ? (
                <>
                  <span className="text-xs text-charcoal-3">
                    {outcome.batch.submissionNo} · {outcome.bookingCount}건
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm ml-auto"
                    disabled={csvMutation.isPending}
                    onClick={() => {
                      if (outcome.batch !== null) void handleDownloadCsv(outcome.batch);
                    }}
                  >
                    {csvMutation.isPending && csvMutation.variables?.batchId === outcome.batch.batchId && (
                      <ButtonSpinner />
                    )}
                    CSV 받기
                  </button>
                </>
              ) : (
                <span className="text-xs text-coral">{outcome.errorMessage}</span>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            닫기
          </button>
          <Link href={toRoute('/admin/facility-bookings?tab=ready')} className="btn btn-primary btn-sm">
            제출 대기로 이동
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
