'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  formatDateKst,
  useCancelSubmissionBatchMutation,
  useCompleteSubmissionBatchMutation,
  useDownloadSubmissionCsvMutation,
  useSubmissionBatchDetailQuery,
} from '@duing/hooks';
import type { CompleteSubmissionBatchResult, SubmissionCandidateBooking } from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { toRoute } from '@/app/_lib/route';
import { downloadBlobFile } from '@/app/_lib/downloadFile';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ViewModeToggle, type SubmissionViewMode } from '../../../_components/ViewModeToggle';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { BatchCancelDialog } from '../../_components/BatchCancelDialog';
import { BatchCompleteDialog } from '../../_components/BatchCompleteDialog';
import { BatchCompleteResultDialog } from '../../_components/BatchCompleteResultDialog';
import { SubmissionAuditHistory } from '../../_components/SubmissionAuditHistory';
import { SubmissionDetailSheet } from '../../_components/SubmissionDetailSheet';
import { SubmissionTimetable } from '../../_components/SubmissionTimetable';
import { buildClubGroups } from '../../_lib/submissionGroups';
import {
  BATCH_STATUS_META,
  deriveBatchStatus,
  submissionCsvFileName,
  type SubmissionBatchStatus,
} from '../../_lib/submissionBatches';
import { SUBMISSION_STATUS_LABELS, submissionBlockVisual } from '../../_lib/submissionTimetable';

const BATCH_LIST_ROUTE = toRoute('/admin/facility-bookings?tab=batches');
/**
 * 상세 Sheet 가 제출번호를 소개하는 문구 — 예약의 업무 상태가 아니라 "이 목록과의 관계"를 말한다.
 * 취소된 목록은 학교에 실제 제출된 것이 아니므로 '제출됨'으로 읽히지 않게 관계로만 서술한다.
 */
const SUBMISSION_RELATION_LABELS: Record<SubmissionBatchStatus, string> = {
  REVIEWING: '이 제출 목록에 포함',
  COMPLETED: '이 제출 목록에 포함',
  CANCELLED: '취소된 제출 목록에 포함',
};
// 읽기 전용 시간표는 선택이 없다 — 안정적인 빈 Set 하나를 공유한다.
const EMPTY_SELECTION: ReadonlySet<number> = new Set();


type Props = {
  batchId: number;
};

/** 서버 메시지 우선(취소 충돌 등 사용자 안내형), 없으면 폴백 — 목록 탭 batchCancelErrorMessage 동일 패턴. */
function cancelErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '제출 목록 취소에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

/** 완료 실패도 서버 메시지 우선(409 기취소·기완료 안내), 없으면 폴백. */
function completeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '학교 제출 완료에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

/**
 * 제출 목록 상세(스펙 v3 §7.3) — 한 배치의 포함 예약(동아리별 그룹·시간표)과 운영 기록을 읽기 전용으로 보여주고,
 * REVIEWING 배치에 한해 완료/취소 액션을 노출한다(CSV 는 전 상태). 취소 성공 시 목록 탭으로 돌아간다.
 */
export function SubmissionBatchDetailPage({ batchId }: Props) {
  const detailQuery = useSubmissionBatchDetailQuery(batchId);
  const cancelMutation = useCancelSubmissionBatchMutation();
  const completeMutation = useCompleteSubmissionBatchMutation();
  const csvMutation = useDownloadSubmissionCsvMutation();
  const { addToast } = useToast();
  const router = useGuardedRouter();

  const [view, setView] = useState<SubmissionViewMode>('list');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeResult, setCompleteResult] = useState<CompleteSubmissionBatchResult | null>(null);
  const [detailBooking, setDetailBooking] = useState<SubmissionCandidateBooking | null>(null);

  const detail = detailQuery.data;

  // 완료 결과 Dialog(제외 목록)의 예약일·동아리 라벨 소스 — 페이지 레벨에서 유지한다(데이터 없으면 null → 예약번호 폴백).
  const bookingsById = useMemo<ReadonlyMap<number, SubmissionCandidateBooking> | null>(
    () =>
      detail === undefined
        ? null
        : new Map(detail.bookings.map((booking) => [booking.bookingId, booking])),
    [detail],
  );

  const handleDownloadCsv = async () => {
    if (detail === undefined) return;
    try {
      const csvBlob = await csvMutation.mutateAsync({ batchId });
      downloadBlobFile(submissionCsvFileName(detail.batch.submissionNo), csvBlob);
    } catch {
      addToast('CSV 다운로드에 실패했어요. 잠시 후 다시 시도해 주세요.', { variant: 'error' });
    }
  };

  const handleCancelConfirm = async () => {
    try {
      await cancelMutation.mutateAsync({ batchId });
      setCancelOpen(false);
      addToast('제출 목록이 취소되었어요.');
      // 취소된 배치는 이 화면에 더 머물 이유가 없어 목록 탭으로 되돌린다(가드 라우터로 오프라인 방어).
      router.replace(BATCH_LIST_ROUTE);
    } catch (error) {
      addToast(cancelErrorMessage(error), { variant: 'error' });
    }
  };

  const handleCompleteConfirm = async () => {
    try {
      const result = await completeMutation.mutateAsync({ batchId });
      setCompleteOpen(false);
      // 스킵 0 은 토스트로 마무리, 스킵 있으면 결과 Dialog(제외 목록)를 연다 — 목록 탭 동일 분기.
      if (result.skippedCount === 0) addToast('학교 제출이 완료되었습니다.');
      else setCompleteResult(result);
    } catch (error) {
      addToast(completeErrorMessage(error), { variant: 'error' });
    }
  };

  return (
    <main className="max-w-layout mx-auto px-4 py-10 sm:px-6 md:px-10">
      <div className="mb-6">
        <Link href={BATCH_LIST_ROUTE} className="text-[13px] text-charcoal-2 hover:text-ink">
          ← 제출 목록
        </Link>
      </div>

      {detailQuery.isLoading && <LoadingGate label="제출 목록 불러오는 중" />}

      {/* 404 는 보유 데이터가 아예 없을 때만 — 성공 후 백그라운드 refetch 실패는 보유 데이터로 계속 렌더(이월 #8). */}
      {detail === undefined && detailQuery.isError && (
        <div role="alert" className="py-12 text-center text-sm text-charcoal-2">
          <p>제출 목록을 찾을 수 없어요.</p>
          <Link
            href={BATCH_LIST_ROUTE}
            className="mt-2 inline-block text-charcoal-2 hover:text-ink hover:underline"
          >
            제출 목록으로 돌아가기
          </Link>
        </div>
      )}

      {detail !== undefined && (() => {
        const status = deriveBatchStatus(detail.batch);
        const statusMeta = BATCH_STATUS_META[status];
        const facilityLabel = detail.batch.facilityName ?? `시설 ${detail.batch.facilityId}`;
        const memoText =
          detail.batch.memo !== null && detail.batch.memo.trim() !== '' ? detail.batch.memo : '-';
        const groups = buildClubGroups(detail.bookings);
        // 시간표의 selectable 블록 클릭(onToggleSelect)도 상세 Sheet 로 흘려 전 블록을 읽기 전용화한다.
        const openBookingDetail = (targetBookingId: number) => {
          const booking = detail.bookings.find((item) => item.bookingId === targetBookingId);
          if (booking !== undefined) setDetailBooking(booking);
        };

        return (
          <>
            <div className="mb-6 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[22px] font-bold text-ink">{detail.batch.submissionNo}</h1>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                >
                  {statusMeta.label}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                <div className="flex gap-2">
                  <dt className="text-charcoal-3">시설</dt>
                  <dd className="text-charcoal">{facilityLabel}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-charcoal-3">포함 예약</dt>
                  <dd className="text-charcoal">{detail.batch.bookingCount}건</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-charcoal-3">생성일</dt>
                  <dd className="text-charcoal">{formatDateKst(detail.batch.submittedAt)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-charcoal-3">생성자</dt>
                  <dd className="text-charcoal">{detail.batch.submittedByName ?? '-'}</dd>
                </div>
                <div className="col-span-2 flex gap-2 sm:col-span-3">
                  <dt className="shrink-0 text-charcoal-3">메모</dt>
                  <dd className="text-charcoal">{memoText}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2">
                {/* 완료·취소는 REVIEWING 배치 전용, CSV 는 전 상태 허용(감사용 재다운로드 §5.5). */}
                {status === 'REVIEWING' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setCompleteOpen(true)}
                  >
                    제출 완료
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={csvMutation.isPending}
                  onClick={() => void handleDownloadCsv()}
                >
                  {csvMutation.isPending && <ButtonSpinner />}
                  CSV
                </button>
                {status === 'REVIEWING' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-coral"
                    onClick={() => setCancelOpen(true)}
                  >
                    제출 목록 취소
                  </button>
                )}
              </div>
            </div>

            <ViewModeToggle view={view} onChange={setView} className="mb-2 justify-end" />

            {view === 'list' ? (
              <ul className="space-y-2">
                {groups.map((group) => {
                  const clubLabel = group.clubName ?? `동아리 ${group.clubId}`;
                  return (
                    <li
                      key={group.clubId}
                      role="group"
                      aria-label={clubLabel}
                      className="rounded-xl border border-line bg-paper"
                    >
                      <div className="flex items-center gap-2 px-3 py-2">
                        <span className="font-medium text-ink-deep">{clubLabel}</span>
                        <span className="text-xs text-charcoal-3">{group.bookings.length}건</span>
                      </div>
                      <ul className="border-t border-line/60">
                        {group.bookings.map((booking) => (
                          <li key={booking.bookingId} className="border-b border-line/40 last:border-b-0">
                            {/* 읽기 전용 — 체크박스 없이 행 전체 클릭으로 상세 Sheet 를 연다. */}
                            <button
                              type="button"
                              onClick={() => setDetailBooking(booking)}
                              className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sage-mist/40"
                            >
                              <span className="font-mono text-xs text-charcoal">{booking.reservationDate}</span>
                              <span className="font-mono text-xs text-charcoal">
                                {booking.startTime}~{booking.endTime}
                              </span>
                              <span className="max-w-40 truncate text-charcoal-2">{booking.purpose}</span>
                              <span className="tabular-nums text-xs text-charcoal-3">
                                {booking.attendeeCount !== null ? `${booking.attendeeCount}명` : '-'}
                              </span>
                              <span className={`ml-auto text-[11px] ${submissionBlockVisual(booking).nameClass}`}>
                                {SUBMISSION_STATUS_LABELS[booking.status]}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <SubmissionTimetable
                bookings={detail.bookings}
                facilityName={facilityLabel}
                selection={EMPTY_SELECTION}
                onToggleSelect={openBookingDetail}
                onShowDetail={setDetailBooking}
              />
            )}

            <section className="mt-8">
              <h2 className="mb-2 text-base font-semibold text-ink-deep">운영 기록</h2>
              <SubmissionAuditHistory audits={detail.audits} />
            </section>

            <SubmissionDetailSheet
              booking={detailBooking}
              facilityName={
                detailBooking?.facilityName ??
                (detailBooking !== null ? `시설 ${detailBooking.facilityId}` : '')
              }
              onClose={() => setDetailBooking(null)}
              submissionRelationLabel={SUBMISSION_RELATION_LABELS[status]}
            />
          </>
        );
      })()}

      {/*
        Dialog 3종은 쿼리 게이트 밖(페이지 레벨)에 무조건 마운트한다 — 완료 결과 Dialog 가 열린 채
        onSettled 상세 refetch 가 실패(보유 데이터는 유지)해도 사라지지 않게(목록 탭과 동일 안정성).
      */}
      <BatchCancelDialog
        batch={cancelOpen && detail !== undefined ? detail.batch : null}
        isPending={cancelMutation.isPending}
        onConfirm={() => void handleCancelConfirm()}
        onClose={() => setCancelOpen(false)}
      />
      <BatchCompleteDialog
        batch={completeOpen && detail !== undefined ? detail.batch : null}
        isPending={completeMutation.isPending}
        onConfirm={() => void handleCompleteConfirm()}
        onClose={() => setCompleteOpen(false)}
      />
      <BatchCompleteResultDialog
        result={completeResult}
        bookingsById={bookingsById}
        onClose={() => setCompleteResult(null)}
      />
    </main>
  );
}
