'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  formatDateKst,
  useCancelSubmissionBatchMutation,
  useCompleteSubmissionBatchMutation,
  useDownloadSubmissionCsvMutation,
  useSubmissionBatchesQuery,
} from '@duing/hooks';
import type {
  CompleteSubmissionBatchResult,
  SubmissionBatchStatusFilter,
  SubmissionBatchSummary,
} from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { StatusPill } from '@/app/_components/StatusPill';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { Pagination } from '@/components/Pagination';
import { downloadBlobFile } from '@/app/_lib/downloadFile';
import { toRoute } from '../../../_lib/route';
import { EmptyState } from '../_components/EmptyState';
import { BatchCancelDialog } from '../submission/_components/BatchCancelDialog';
import { BatchCompleteDialog } from '../submission/_components/BatchCompleteDialog';
import { BatchCompleteResultDialog } from '../submission/_components/BatchCompleteResultDialog';
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

/** 완료 실패도 서버 메시지 우선(409 기취소·기완료 안내), 없으면 폴백 — batchCancelErrorMessage 동일 패턴. */
function batchCompleteErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '학교 제출 완료에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

/**
 * 제출 목록 탭(스펙 v3 §7.3) — 만든 제출 목록을 상태 배지와 함께 표로 보여준다.
 * CSV 는 전 상태 허용(완료·취소 배치도 감사용 재다운로드 §5.5), '제출 완료'·'취소' 는 REVIEWING 전용.
 * statusFilter='REVIEWING' 이면 '제출 대기' 워크플로 탭(진행 중만), 생략하면 '제출 이력' 탭(전체)이 된다(개편 스펙 §5·§6).
 */
export function SubmissionBatchesTab({ statusFilter }: { statusFilter?: SubmissionBatchStatusFilter }) {
  const [page, setPage] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<SubmissionBatchSummary | null>(null);
  const [completeTarget, setCompleteTarget] = useState<SubmissionBatchSummary | null>(null);
  const [completeResult, setCompleteResult] = useState<CompleteSubmissionBatchResult | null>(null);
  const batchesQuery = useSubmissionBatchesQuery({ page, size: PAGE_SIZE, status: statusFilter });
  const cancelMutation = useCancelSubmissionBatchMutation();
  const completeMutation = useCompleteSubmissionBatchMutation();
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

  const handleCompleteConfirm = async () => {
    if (completeTarget === null) return;
    try {
      const result = await completeMutation.mutateAsync({ batchId: completeTarget.batchId });
      setCompleteTarget(null);
      // 스킵 0 은 토스트로 마무리, 스킵 있으면 확인 Dialog 를 닫고 결과 Dialog(제외 목록)를 연다.
      if (result.skippedCount === 0) {
        addToast('학교 제출이 완료되었습니다.');
      } else {
        setCompleteResult(result);
      }
    } catch (error) {
      // 실패 시 확인 Dialog 를 유지(completeTarget 그대로) — 서버 메시지 우선 안내만.
      addToast(batchCompleteErrorMessage(error), { variant: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      {batchesQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="제출 목록 불러오는 중" />}

      {!batchesQuery.isLoading && batchesQuery.isError && (
        <div role="alert" className="text-sm text-charcoal-2">
          <p>제출 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <button type="button" className="btn btn-ghost mt-2" onClick={() => void batchesQuery.refetch()}>
            다시 시도
          </button>
        </div>
      )}

      {!batchesQuery.isLoading && batchesQuery.isSuccess && batches.length === 0 && (
        <EmptyState
          icon="📄"
          title={statusFilter === 'REVIEWING' ? '진행 중인 제출 목록이 없어요' : '아직 만든 제출 목록이 없어요'}
          body="'제출 준비' 탭에서 승인된 예약을 골라 만들 수 있어요."
          action={
            <Link href={toRoute('/admin/facility-bookings?tab=prepare')} className="btn btn-secondary btn-sm">
              제출 준비로 이동
            </Link>
          }
        />
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
                    <td className="whitespace-nowrap py-2 pr-3">{formatDateKst(batch.submittedAt)}</td>
                    <td className="py-2 pr-3">{batch.submittedByName ?? '-'}</td>
                    <td className="max-w-[12rem] truncate py-2 pr-3" title={memoText}>
                      {memoText}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusPill label={statusMeta.label} className={statusMeta.badgeClass} />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {/* '제출 완료'·'취소' 는 REVIEWING 행 전용 — 확인 Dialog 를 거쳐 완료/취소 처리한다. */}
                        {status === 'REVIEWING' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setCompleteTarget(batch)}
                          >
                            제출 완료
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={csvMutation.isPending}
                          onClick={() => void handleDownloadCsv(batch)}
                        >
                          {/* 동일 batchId 중복 발사·CSV_DOWNLOADED 중복 기록 방지 — 뮤테이션 하나를 표 전체 CSV 버튼이 공유하므로 비활성은 전역이되,
                              스피너는 실제 내려받는 행에만 둔다(모든 행이 함께 도는 것처럼 보이지 않게). */}
                          {csvMutation.isPending && csvMutation.variables?.batchId === batch.batchId && (
                            <ButtonSpinner />
                          )}
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

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={setPage}
        ariaLabel="제출 목록 페이지"
        totalElements={batchesQuery.data?.totalElements}
        pageSize={PAGE_SIZE}
      />

      <BatchCancelDialog
        batch={cancelTarget}
        isPending={cancelMutation.isPending}
        onConfirm={() => void handleCancelConfirm()}
        onClose={() => setCancelTarget(null)}
      />

      <BatchCompleteDialog
        batch={completeTarget}
        isPending={completeMutation.isPending}
        onConfirm={() => void handleCompleteConfirm()}
        onClose={() => setCompleteTarget(null)}
      />

      {/* 목록 탭은 bookingsById 미공급 → 제외 행을 예약번호로 표기(상세 화면 Task 5 만 예약일·동아리 공급). */}
      <BatchCompleteResultDialog
        result={completeResult}
        bookingsById={null}
        onClose={() => setCompleteResult(null)}
      />
    </div>
  );
}
