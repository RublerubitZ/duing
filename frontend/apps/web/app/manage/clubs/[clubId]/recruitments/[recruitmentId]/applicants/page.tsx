'use client';

import { use, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import Link from 'next/link';
import { ApiError } from '@duing/api';
import type {
  ApplicantsFilters,
  ApplicationStatus,
  BulkUpdateApplicationStatusPayload,
  BulkUpdateApplicationStatusResult,
  College,
} from '@duing/types';
import {
  useRecruitmentDetailQuery,
  useApplicantsQuery,
  useBulkUpdateApplicationStatusMutation,
} from '@duing/hooks';
import { safeExternalHref, toRoute } from '../../../../../../_lib/route';
import { ApplicantTable } from './_components/ApplicantTable';
import { ApplicantsFilterBar } from './_components/ApplicantsFilterBar';
import { BulkActionBar } from './_components/BulkActionBar';
import { BulkConfirmDialog } from './_components/BulkConfirmDialog';
import { BulkPromoteDialog } from './_components/BulkPromoteDialog';
import { LoadingGate } from '@/components/loading/LoadingGate';

type PageParams = { params: Promise<{ clubId: string; recruitmentId: string }> };

export default function ApplicantsPage({ params }: PageParams) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);

  const router = useGuardedRouter();
  const searchParams = useSearchParams();

  const filters = useMemo<ApplicantsFilters>(
    () => ({
      status: (searchParams.get('status') as ApplicationStatus | null) ?? undefined,
      college: (searchParams.get('college') as College | null) ?? undefined,
      q: searchParams.get('q') ?? undefined,
      submittedFrom: searchParams.get('submittedFrom') ?? undefined,
      submittedTo: searchParams.get('submittedTo') ?? undefined,
    }),
    [searchParams],
  );

  const updateFilters = useCallback(
    (nextFilters: ApplicantsFilters) => {
      const nextParams = new URLSearchParams();
      if (nextFilters.status) nextParams.set('status', nextFilters.status);
      if (nextFilters.college) nextParams.set('college', nextFilters.college);
      if (nextFilters.q) nextParams.set('q', nextFilters.q);
      if (nextFilters.submittedFrom)
        nextParams.set('submittedFrom', nextFilters.submittedFrom);
      if (nextFilters.submittedTo) nextParams.set('submittedTo', nextFilters.submittedTo);
      router.replace(`?${nextParams.toString()}`);
    },
    [router],
  );

  const { data: recruitment, isLoading: isRecruitmentLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );
  const { data: applicants = [], isLoading: isApplicantsLoading } = useApplicantsQuery(
    recruitment?.applicationMode === 'SELF' && !isNaN(recruitmentId)
      ? recruitmentId
      : undefined,
    filters,
  );
  const bulkMutation = useBulkUpdateApplicationStatusMutation(recruitmentId);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  // INTERVIEW_PENDING 전이는 BulkPromoteDialog (Spec P0-4) 가 전담하므로,
  // BulkConfirmDialog 의 pending target 에서는 INTERVIEW_PENDING 을 제외한다.
  const [pendingBulkTarget, setPendingBulkTarget] = useState<
    Exclude<BulkUpdateApplicationStatusPayload['status'], 'INTERVIEW_PENDING'> | null
  >(null);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [lastBulkResult, setLastBulkResult] =
    useState<BulkUpdateApplicationStatusResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const useInterview = recruitment?.useInterview ?? true;

  function handleBulkConfirm() {
    if (!pendingBulkTarget || selectedIds.length === 0) {
      setPendingBulkTarget(null);
      return;
    }
    setBulkError(null);
    bulkMutation.mutate(
      { applicationIds: selectedIds, status: pendingBulkTarget },
      {
        onSuccess: (result) => {
          setLastBulkResult(result);
          setSelectedIds([]);
          setPendingBulkTarget(null);
        },
        onError: (mutationError) => {
          const message =
            mutationError instanceof ApiError
              ? mutationError.message
              : '일괄 처리에 실패했습니다.';
          setBulkError(message);
          setPendingBulkTarget(null);
        },
      },
    );
  }

  // Spec P0-4 — "면접 대상으로 선정" 확정. 본문 모달은 INTERVIEW_PENDING 전용.
  function handlePromoteConfirm() {
    if (selectedIds.length === 0) {
      setIsPromoteDialogOpen(false);
      return;
    }
    setBulkError(null);
    bulkMutation.mutate(
      { applicationIds: selectedIds, status: 'INTERVIEW_PENDING' },
      {
        onSuccess: (result) => {
          setLastBulkResult(result);
          setSelectedIds([]);
          setIsPromoteDialogOpen(false);
        },
        onError: (mutationError) => {
          const message =
            mutationError instanceof ApiError
              ? mutationError.message
              : '일괄 처리에 실패했습니다.';
          setBulkError(message);
          setIsPromoteDialogOpen(false);
        },
      },
    );
  }

  // 선택된 지원자 중 대표 (정렬은 list 응답 기준 — 첫 번째 선택자).
  // applicants list 순서를 따라가서 BulkActionBar 의 "선택 N건" 과 일관된 표시.
  const promoteRepresentativeName = useMemo(() => {
    if (selectedIds.length === 0) return '';
    const firstSelected = applicants.find((applicant) =>
      selectedSet.has(applicant.applicationId),
    );
    return firstSelected?.userName ?? '';
  }, [applicants, selectedIds, selectedSet]);

  const hasActiveFilters = Object.values(filters).some(Boolean);

  if (isRecruitmentLoading || !recruitment) {
    return <LoadingGate label="모집 정보 불러오는 중" />;
  }

  return (
    <div
      className={`mx-auto max-w-5xl px-6 py-10 ${
        selectedIds.length > 0
          ? 'pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-24'
          : 'pb-24'
      }`}
    >
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-1">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 모집 상세로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-slate-900">
          {recruitment.title} — 지원자 관리
        </h1>
      </div>

      {/* 외부 폼 안내 — 지원서를 두잉에서 받지 않으므로 목록 대신 안내와 되돌아갈 길만 준다(§5.1) */}
      {recruitment.applicationMode === 'EXTERNAL' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center">
          <p className="text-sm text-slate-600">
            외부 폼 모집은 지원자 관리를 사용하지 않아요. 외부 폼 응답은 외부 시스템에서 확인하고,
            합격자 등록은 모집 상세의 가입 링크로 진행해주세요.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-4">
            <Link
              href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
              className="text-sm text-sky-600 hover:underline"
            >
              모집 상세로 이동 →
            </Link>
            {(() => {
              const safeExternalFormUrl = safeExternalHref(recruitment.externalFormUrl);
              if (!safeExternalFormUrl) return null;
              return (
                <a
                  href={safeExternalFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-sky-600 hover:underline"
                >
                  외부 폼 바로가기 →
                </a>
              );
            })()}
          </div>
        </div>
      )}

      {/* 자체 폼 지원자 관리 */}
      {recruitment.applicationMode === 'SELF' && (
        <>
          {/* 필터 바 */}
          <ApplicantsFilterBar
            filters={filters}
            onChange={updateFilters}
            useInterview={useInterview}
          />

          {/* 일괄 처리 결과 알림 */}
          {lastBulkResult && (
            <div
              className={
                lastBulkResult.failures.length === 0
                  ? 'mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                  : 'mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    일괄 처리 완료: {lastBulkResult.updated}건 성공
                    {lastBulkResult.failures.length > 0 &&
                      ` · ${lastBulkResult.failures.length}건 실패`}
                  </div>
                  {lastBulkResult.failures.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {lastBulkResult.failures.slice(0, 5).map((failure) => (
                        <li key={failure.applicationId}>
                          ID {failure.applicationId}: {failure.reason}
                        </li>
                      ))}
                      {lastBulkResult.failures.length > 5 && (
                        <li>외 {lastBulkResult.failures.length - 5}건…</li>
                      )}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLastBulkResult(null)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  닫기
                </button>
              </div>
            </div>
          )}

          {/* 오류 메시지 */}
          {bulkError && (
            <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {bulkError}
            </p>
          )}

          {/* 로딩 / 빈 상태 / 테이블 */}
          {isApplicantsLoading ? (
            <LoadingGate label="지원자 목록 불러오는 중" className="min-h-0 py-8" />
          ) : applicants.length === 0 ? (
            <p className="mt-8 py-8 text-center text-neutral-500">
              {hasActiveFilters ? '검색 결과 없음' : '지원자가 아직 없습니다'}
            </p>
          ) : (
            <ApplicantTable
              applicants={applicants}
              selectedIds={selectedIds}
              selectedSet={selectedSet}
              onSelect={setSelectedIds}
              useInterview={useInterview}
              clubId={clubId}
              recruitmentId={recruitmentId}
            />
          )}
        </>
      )}

      {/* 일괄 처리 sticky bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        onBulkAction={setPendingBulkTarget}
        onPromoteToInterview={() => setIsPromoteDialogOpen(true)}
        useInterview={useInterview}
      />

      {/* 일괄 처리 확인 dialog (UNDER_REVIEW / ACCEPTED / REJECTED) */}
      {pendingBulkTarget && (
        <BulkConfirmDialog
          targetStatus={pendingBulkTarget}
          selectedCount={selectedIds.length}
          isPending={bulkMutation.isPending}
          onConfirm={handleBulkConfirm}
          onCancel={() => setPendingBulkTarget(null)}
        />
      )}

      {/* 면접 대상 선정 dialog (Spec P0-4) */}
      {isPromoteDialogOpen && (
        <BulkPromoteDialog
          representativeName={promoteRepresentativeName}
          selectedCount={selectedIds.length}
          isPending={bulkMutation.isPending}
          onConfirm={handlePromoteConfirm}
          onCancel={() => setIsPromoteDialogOpen(false)}
        />
      )}

      {/* PII 고지 */}
      <footer className="mt-10 pt-4 text-center text-xs text-slate-400">
        본 정보는 합격 결정 외 용도로 사용하지 않습니다
      </footer>
    </div>
  );
}
