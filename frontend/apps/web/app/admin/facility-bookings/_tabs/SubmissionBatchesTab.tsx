'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useCancelSubmissionBatchMutation,
  useDownloadSubmissionCsvMutation,
  useSubmissionBatchesQuery,
} from '@duing/hooks';
import type { SubmissionBatchSummary } from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { Pagination } from '@/components/Pagination';
import { downloadBlobFile } from '@/app/_lib/downloadFile';
import { toRoute } from '../../../_lib/route';
import { BatchCancelDialog } from '../submission/_components/BatchCancelDialog';
import {
  BATCH_STATUS_META,
  deriveBatchStatus,
  submissionCsvFileName,
} from '../submission/_lib/submissionBatches';

const PAGE_SIZE = 10;

/** 서버 메시지 우선(완료/취소 충돌 등 사용자 안내형), 없으면 폴백 — 준비 탭 submissionErrorMessage 동일 패턴. */
function batchCancelErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '제출 목록 취소에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

/**
 * 제출 목록 탭(스펙 v3 §7.3) — 만든 제출 목록을 상태 배지와 함께 표로 보여준다.
 * CSV 는 전 상태 허용(완료·취소 배치도 감사용 재다운로드 §5.5), '제출 완료'·'취소' 는 REVIEWING 전용.
 */
export function SubmissionBatchesTab() {
  const [page, setPage] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<SubmissionBatchSummary | null>(null);
  const batchesQuery = useSubmissionBatchesQuery({ page, size: PAGE_SIZE });
  const cancelMutation = useCancelSubmissionBatchMutation();
  const csvMutation = useDownloadSubmissionCsvMutation();
  const { addToast } = useToast();

  const batches = batchesQuery.data?.content ?? [];
  const totalPages = batchesQuery.data?.totalPages ?? 0;

  const handleDownloadCsv = async (batch: SubmissionBatchSummary) => {
    try {
      const csvBlob = await csvMutation.mutateAsync({ batchId: batch.batchId });
      downloadBlobFile(submissionCsvFileName(batch.submissionNo), csvBlob);
    } catch {
      addToast('CSV 다운로드에 실패했어요. 잠시 후 다시 시도해 주세요.', { variant: 'error' });
    }
  };

  const handleCancelConfirm = async () => {
    if (cancelTarget === null) return;
    try {
      await cancelMutation.mutateAsync({ batchId: cancelTarget.batchId });
      setCancelTarget(null);
      addToast('제출 목록이 취소되었어요.');
    } catch (error) {
      addToast(batchCancelErrorMessage(error), { variant: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      {batchesQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="제출 목록 불러오는 중" />}

      {!batchesQuery.isLoading && batchesQuery.isError && (
        <div role="alert" className="text-sm text-charcoal-2">
          <p>제출 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
          <button type="button" className="btn btn-ghost mt-2" onClick={() => void batchesQuery.refetch()}>
            다시 시도
          </button>
        </div>
      )}

      {!batchesQuery.isLoading && batchesQuery.isSuccess && batches.length === 0 && (
        <p className="text-sm text-charcoal-3">
          {"아직 만든 제출 목록이 없어요. '학교 제출 준비' 탭에서 만들 수 있어요."}
        </p>
      )}

      {!batchesQuery.isLoading && batchesQuery.isSuccess && batches.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-charcoal-3">
                <th className="py-2 pr-3 font-medium">제출번호</th>
                <th className="py-2 pr-3 font-medium">시설</th>
                <th className="py-2 pr-3 font-medium">예약 건수</th>
                <th className="py-2 pr-3 font-medium">생성일</th>
                <th className="py-2 pr-3 font-medium">생성자</th>
                <th className="py-2 pr-3 font-medium">메모</th>
                <th className="py-2 pr-3 font-medium">상태</th>
                <th className="py-2 font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const status = deriveBatchStatus(batch);
                const statusMeta = BATCH_STATUS_META[status];
                const facilityLabel = batch.facilityName ?? `시설 ${batch.facilityId}`;
                const memoText = batch.memo !== null && batch.memo.trim() !== '' ? batch.memo : '-';
                return (
                  <tr key={batch.batchId} className="border-b border-line/60 align-middle text-charcoal-2">
                    <td className="py-2 pr-3 font-medium text-ink-deep">{batch.submissionNo}</td>
                    <td className="py-2 pr-3">{facilityLabel}</td>
                    <td className="py-2 pr-3">{batch.bookingCount}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{batch.submittedAt.slice(0, 10)}</td>
                    <td className="py-2 pr-3">{batch.submittedByName ?? '-'}</td>
                    <td className="max-w-[12rem] truncate py-2 pr-3" title={memoText}>
                      {memoText}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {/* '제출 완료' 액션은 Task 4 에서 확인 Dialog 를 연결한다 — REVIEWING 행에만 자리를 둔다. */}
                        {status === 'REVIEWING' && (
                          <button type="button" className="btn btn-ghost btn-sm">
                            제출 완료
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void handleDownloadCsv(batch)}
                        >
                          CSV
                        </button>
                        <Link
                          href={toRoute(`/admin/facility-bookings/submission/${batch.batchId}`)}
                          className="text-xs text-charcoal-2 hover:text-ink hover:underline"
                        >
                          상세
                        </Link>
                        {status === 'REVIEWING' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-coral"
                            onClick={() => setCancelTarget(batch)}
                          >
                            취소
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} ariaLabel="제출 목록 페이지" />

      <BatchCancelDialog
        batch={cancelTarget}
        isPending={cancelMutation.isPending}
        onConfirm={() => void handleCancelConfirm()}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}
