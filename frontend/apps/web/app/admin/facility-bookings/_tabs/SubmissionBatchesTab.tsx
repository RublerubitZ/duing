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
import { ConsoleCard } from '../_components/ConsoleCard';
import { EmptyState } from '../_components/EmptyState';
import { BatchCancelDialog } from '../submission/_components/BatchCancelDialog';
import { BatchCompleteDialog } from '../submission/_components/BatchCompleteDialog';
import { BatchCompleteResultDialog } from '../submission/_components/BatchCompleteResultDialog';
import {
  BATCH_STATUS_META,
  batchAgeDays,
  batchTitle,
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
  // 에이징 표기 기준 시각 — 렌더당 1회 계산해 전 행이 같은 기준을 공유한다(큐 테이블 전례).
  const now = new Date();

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
      {/* 목업 CCard — 테이블·빈 상태·페이지네이션을 한 카드가 감싼다. */}
      <ConsoleCard>
      {batchesQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="제출 목록 불러오는 중" />}

      {!batchesQuery.isLoading && batchesQuery.isError && (
        <div role="alert" className="px-[18px] py-8 text-sm text-charcoal-2">
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
              <tr className="bg-graysoft text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3">
                <th className="px-[18px] py-2.5 font-bold">제출 목록</th>
                <th className="py-2.5 pr-3.5 font-bold">시설</th>
                <th className="py-2.5 pr-3.5 font-bold">건수</th>
                <th className="py-2.5 pr-3.5 font-bold">생성일</th>
                <th className="py-2.5 pr-3.5 font-bold">상태</th>
                <th className="py-2.5 pr-[18px] text-right font-bold">처리</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const status = deriveBatchStatus(batch);
                const statusMeta = BATCH_STATUS_META[status];
                const facilityLabel = batch.facilityName ?? `시설 ${batch.facilityId}`;
                // 메모=제목 승격(개편 스펙 §5) — 메모 없으면 제출번호가 제목이라 서브에서 번호를 뺀다.
                const title = batchTitle(batch);
                const subText =
                  title === batch.submissionNo
                    ? (batch.submittedByName ?? '-')
                    : `${batch.submissionNo} · ${batch.submittedByName ?? '-'}`;
                const ageDays = status === 'REVIEWING' ? batchAgeDays(batch.submittedAt, now) : null;
                return (
                  <tr
                    key={batch.batchId}
                    className={`border-b border-line align-middle text-charcoal-2 last:border-b-0 ${
                      status === 'REVIEWING' ? 'bg-sage-tint' : ''
                    }`}
                  >
                    <td className="px-[18px] py-3.5">
                      <p className="max-w-[16rem] truncate text-sm font-bold text-ink-deep" title={title}>
                        {title}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-charcoal-3">{subText}</p>
                    </td>
                    <td className="py-3.5 pr-3.5 text-[13px] font-semibold text-charcoal-2">{facilityLabel}</td>
                    <td className="py-3.5 pr-3.5 font-mono text-sm font-bold text-ink-deep">{batch.bookingCount}건</td>
                    <td className="whitespace-nowrap py-3.5 pr-3.5 font-mono text-[12.5px]">
                      <p>{formatDateKst(batch.submittedAt)}</p>
                      {/* 진행 중 배치의 방치 감지(3일↑ 경고색) / 완료·취소는 처리일을 함께 보여준다. */}
                      {status === 'REVIEWING' && ageDays !== null && ageDays >= 1 && (
                        <p className={`mt-0.5 text-xs ${ageDays >= 3 ? 'font-bold text-[#8E6620]' : 'text-charcoal-3'}`}>
                          생성 {ageDays}일 경과
                        </p>
                      )}
                      {status === 'COMPLETED' && batch.completedAt !== null && (
                        <p className="mt-0.5 text-xs text-charcoal-3">완료 {formatDateKst(batch.completedAt)}</p>
                      )}
                      {status === 'CANCELLED' && batch.cancelledAt !== null && (
                        <p className="mt-0.5 text-xs text-charcoal-3">취소 {formatDateKst(batch.cancelledAt)}</p>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusPill label={statusMeta.label} className={statusMeta.badgeClass} />
                    </td>
                    <td className="py-2">
                      {/* 액션 순서 = 실제 작업 순서(개편 스펙 §5): 제출 완료(주 흐름)는 좌측 고정, 서류·열람 버튼
                          (CSV·상세·취소)은 우측에 묶는다. 제출 완료는 REVIEWING 행에만 있고 mr-auto 로 나머지를 우측으로 민다.
                          이력 행은 제출 완료가 없어 CSV·상세가 그대로 우측(justify-end)에 붙는다. */}
                      <div className="flex w-full items-center justify-end gap-2 whitespace-nowrap">
                        {/* '제출 완료'·'취소' 는 REVIEWING 행 전용 — 확인 Dialog 를 거쳐 완료/취소 처리한다. */}
                        {status === 'REVIEWING' && (
                          // '완료 처리' — 상태 배지 '제출 완료'와 글자가 겹쳐 동작을 상태로 오인하지 않게 명령형으로.
                          // ml-6 로 좌측 끝에서 살짝 띄우고, mr-auto 로 나머지를 우측에 몰아준다.
                          <button
                            type="button"
                            className="btn btn-primary btn-sm ml-6 mr-auto bg-ink-deep hover:bg-ink"
                            onClick={() => setCompleteTarget(batch)}
                          >
                            완료 처리
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
                        {/* 진행 중(REVIEWING)은 전사 콕핏(제출 정보 보기)으로, 완료·취소는 읽기 전용 상세로 진입한다.
                            콕핏은 학교 양식 전사 화면이라 진행 중 배치의 주 업무 진입점이다. */}
                        {status === 'REVIEWING' ? (
                          <Link
                            href={toRoute(`/admin/facility-bookings/submission/${batch.batchId}/transcribe`)}
                            className="btn btn-ghost btn-sm"
                          >
                            제출 정보 보기
                          </Link>
                        ) : (
                          <Link
                            href={toRoute(`/admin/facility-bookings/submission/${batch.batchId}`)}
                            className="btn btn-ghost btn-sm"
                          >
                            상세
                          </Link>
                        )}
                        {status === 'REVIEWING' && (
                          <>
                            {/* 파괴적 동작(취소)은 구분선으로 갈라 낮은 위계로 둔다 — 주 흐름 버튼과 섞이지 않게. */}
                            <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-coral"
                              onClick={() => setCancelTarget(batch)}
                            >
                              취소
                            </button>
                          </>
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

      {totalPages > 1 && (
        <div className="border-t border-line px-[18px] pb-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            ariaLabel="제출 목록 페이지"
            totalElements={batchesQuery.data?.totalElements}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}
      </ConsoleCard>

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
