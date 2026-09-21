'use client';

import { useDeferredValue, useEffect, useState } from 'react';
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
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { BatchCancelDialog } from '../submission/_components/BatchCancelDialog';
import { BatchCompleteDialog } from '../submission/_components/BatchCompleteDialog';
import { BatchCompleteResultDialog } from '../submission/_components/BatchCompleteResultDialog';
import {
  BATCH_STATUS_META,
  batchAgeDays,
  batchFacilityLabel,
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
  // 검색(감사 #15) — 제출번호·메모·동아리명 부분 일치 + 생성일 범위. 검색어는 useDeferredValue 로 타이핑 중
  // 요청을 늦추고(React 19 내장, 별도 디바운스 훅 불필요), 빈 값은 undefined 로 넘겨 쿼리키·쿼리스트링에서 뺀다.
  const [keyword, setKeyword] = useState('');
  const [submittedFrom, setSubmittedFrom] = useState('');
  const [submittedTo, setSubmittedTo] = useState('');
  // 공백만 친 검색어는 BE 가 trim 해 무필터가 되므로 FE 도 필터 없음으로 본다(크롤 탭 동일) — q 결측·일반 빈 상태.
  const deferredKeyword = useDeferredValue(keyword).trim();
  const hasFilter = keyword.trim() !== '' || submittedFrom !== '' || submittedTo !== '';
  const orUndefined = (value: string) => (value === '' ? undefined : value);
  const resetFilters = () => {
    setKeyword('');
    setSubmittedFrom('');
    setSubmittedTo('');
    setPage(0);
  };
  const [cancelTarget, setCancelTarget] = useState<SubmissionBatchSummary | null>(null);
  const [completeTarget, setCompleteTarget] = useState<SubmissionBatchSummary | null>(null);
  const [completeResult, setCompleteResult] = useState<CompleteSubmissionBatchResult | null>(null);
  const batchesQuery = useSubmissionBatchesQuery({
    page,
    size: PAGE_SIZE,
    status: statusFilter,
    q: orUndefined(deferredKeyword),
    submittedFrom: orUndefined(submittedFrom),
    submittedTo: orUndefined(submittedTo),
  });
  const cancelMutation = useCancelSubmissionBatchMutation();
  const completeMutation = useCompleteSubmissionBatchMutation();
  const csvMutation = useDownloadSubmissionCsvMutation();
  const { addToast } = useToast();

  const batches = batchesQuery.data?.content ?? [];
  const totalPages = batchesQuery.data?.totalPages ?? 0;
  // 완료/취소로 마지막 페이지의 배치가 사라지면 재조회 totalPages 가 줄어 현재 page 가 범위 밖(빈 화면)이 된다 —
  // 검토 탭(BookingManagementTab) 전례대로 데이터 도착 후에만 클램프한다(P2-13). 페이지 전환 중엔 data 가 비어
  // totalPages 0 으로 보이므로, 그때 판단하면 정상 이동까지 page 0 으로 되돌린다. (useEffect 금지는 데이터 패칭 한정)
  const loadedTotalPages = batchesQuery.data !== undefined ? totalPages : undefined;
  useEffect(() => {
    if (loadedTotalPages === undefined) return;
    if (loadedTotalPages === 0 && page !== 0) setPage(0);
    else if (loadedTotalPages > 0 && page >= loadedTotalPages) setPage(loadedTotalPages - 1);
  }, [loadedTotalPages, page]);
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
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-[18px] py-3">
        <input
          type="search"
          aria-label="제출 목록 검색"
          placeholder="제출번호·메모·동아리명"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(0);
          }}
          className="w-full max-w-xs rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
        />
        <input
          type="date"
          aria-label="생성일 시작"
          value={submittedFrom}
          onChange={(event) => {
            setSubmittedFrom(event.target.value);
            setPage(0);
          }}
          className="rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
        />
        <input
          type="date"
          aria-label="생성일 종료"
          value={submittedTo}
          onChange={(event) => {
            setSubmittedTo(event.target.value);
            setPage(0);
          }}
          className="rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
        />
        {hasFilter && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
            필터 초기화
          </button>
        )}
      </div>

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
        hasFilter ? (
          // 초기화 버튼은 바로 위 필터 행에 이미 있다(같은 카드) — 여기서 한 번 더 두면 같은 이름 버튼이 둘이 된다.
          <EmptyState icon="🔍" title="조건에 맞는 제출 목록이 없어요" body="검색어·생성일 범위를 넓혀보세요." />
        ) : (
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
        )
      )}

      {!batchesQuery.isLoading && batchesQuery.isSuccess && batches.length > 0 && (
        /* keepPreviousData 전환 중(검색·기간·페이지 변경)에는 이전 목록이 남는다 — 딤으로 "갱신 전 데이터" 신호(회비 콘솔 #906 전례). 필터 행은 딤 밖. */
        <div
          aria-busy={batchesQuery.isPlaceholderData}
          className={`overflow-x-auto ${batchesQuery.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}`}
        >
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead>
              <tr className="bg-graysoft text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3">
                <th className="px-[18px] py-2.5 font-bold">제출 목록</th>
                {/* 배치=동아리 단위(v2 §5) — 동아리가 주 식별자라 시설보다 앞에 둔다. */}
                <th className="py-2.5 pr-3.5 font-bold">동아리</th>
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
                const facilityLabel = batchFacilityLabel(batch);
                // 메모=제목 승격(개편 스펙 §5) — 메모 없으면 제출번호가 제목이라 서브에서 번호를 뺀다.
                const title = batchTitle(batch);
                const subText =
                  title === batch.submissionNo
                    ? (batch.submittedByName ?? '-')
                    : `${batch.submissionNo} · ${batch.submittedByName ?? '-'}`;
                const ageDays = status === 'REVIEWING' ? batchAgeDays(batch.submittedAt, now) : null;
                const downloadingThisRow =
                  csvMutation.isPending && csvMutation.variables?.batchId === batch.batchId;
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
                    {/* 포함 동아리명(동아리 중심 보기 스펙 §2) — 구버전 응답(결측)·빈 배열은 '-' 폴백. */}
                    <td className="py-3.5 pr-3.5 text-[13px] text-charcoal-2">
                      {batch.clubNames === undefined || batch.clubNames.length === 0 ? (
                        '-'
                      ) : (
                        <p className="max-w-[14rem] truncate" title={batch.clubNames.join(', ')}>
                          {batch.clubNames.join(' · ')}
                        </p>
                      )}
                    </td>
                    {/* 시설 표기 단일 규칙(v2 §5) — 다시설 목록은 길어질 수 있어 truncate+title. */}
                    <td className="py-3.5 pr-3.5 text-[13px] font-semibold text-charcoal-2">
                      <p className="max-w-[14rem] truncate" title={facilityLabel}>
                        {facilityLabel}
                      </p>
                    </td>
                    <td className="py-3.5 pr-3.5 tabular-nums text-sm font-bold text-ink-deep">{batch.bookingCount}건</td>
                    <td className="whitespace-nowrap py-3.5 pr-3.5 tabular-nums text-[12.5px]">
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
                        {/* 같은 batchId 중복 발사·CSV_DOWNLOADED 중복 기록만 막으면 되므로 비활성·스피너 모두 해당 행에만(감사 #16). */}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={downloadingThisRow}
                          onClick={() => void handleDownloadCsv(batch)}
                        >
                          {downloadingThisRow && <ButtonSpinner />}
                          CSV
                        </button>
                        {/* 진행 중(REVIEWING)은 전사 콕핏(제출 정보 보기)이 주 진입점이고, 운영 기록·시간표를 보는
                            읽기 전용 상세도 함께 연다(감사 #14). 완료·취소는 상세만. */}
                        {status === 'REVIEWING' && (
                          <Link
                            href={toRoute(`/admin/facility-bookings/submission/${batch.batchId}/transcribe`)}
                            className="btn btn-ghost btn-sm"
                          >
                            제출 정보 보기
                          </Link>
                        )}
                        <Link
                          href={toRoute(`/admin/facility-bookings/submission/${batch.batchId}`)}
                          className="btn btn-ghost btn-sm"
                        >
                          상세
                        </Link>
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
        <div className="px-[18px] pb-4">
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
