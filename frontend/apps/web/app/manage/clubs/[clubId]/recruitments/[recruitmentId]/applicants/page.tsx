'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@duing/api';
import type { ApplicationStatus, BulkUpdateApplicationStatusResult } from '@duing/types';
import {
  useRecruitmentDetailQuery,
  useApplicantsQuery,
  useBulkUpdateApplicationStatusMutation,
} from '@duing/hooks';
import { toRoute } from '../../../../../../_lib/route';
import { APPLICATION_STATUS_LABEL } from '../../../../../../_constants/application-status';
import { ApplicantTable } from './_components/ApplicantTable';
import { ApplicantDetailModal } from './_components/ApplicantDetailModal';
import { BulkActionBar } from './_components/BulkActionBar';
import { BulkConfirmDialog } from './_components/BulkConfirmDialog';

type StatusFilter = 'ALL' | ApplicationStatus;
type BulkTarget = Extract<ApplicationStatus, 'ACCEPTED' | 'REJECTED'>;

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: '전체', value: 'ALL' },
  { label: APPLICATION_STATUS_LABEL.SUBMITTED, value: 'SUBMITTED' },
  { label: APPLICATION_STATUS_LABEL.UNDER_REVIEW, value: 'UNDER_REVIEW' },
  { label: APPLICATION_STATUS_LABEL.INTERVIEW_PENDING, value: 'INTERVIEW_PENDING' },
  { label: APPLICATION_STATUS_LABEL.ACCEPTED, value: 'ACCEPTED' },
  { label: APPLICATION_STATUS_LABEL.REJECTED, value: 'REJECTED' },
];

export default function ApplicantsPage({
  params,
}: {
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [pendingBulkTarget, setPendingBulkTarget] = useState<BulkTarget | null>(null);
  const [lastResult, setLastResult] = useState<BulkUpdateApplicationStatusResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const { data: recruitment, isLoading: isRecruitmentLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );
  const { data: applicants, isLoading: isApplicantsLoading } = useApplicantsQuery(
    recruitment?.applicationMode === 'SELF' && !isNaN(recruitmentId)
      ? recruitmentId
      : undefined,
  );
  const bulkMutation = useBulkUpdateApplicationStatusMutation(recruitmentId);

  const filteredApplicants = useMemo(
    () =>
      applicants?.filter(
        (applicant) => statusFilter === 'ALL' || applicant.status === statusFilter,
      ) ?? [],
    [applicants, statusFilter],
  );

  function toggleOne(applicationId: number) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((previous) => {
      const allSelected = filteredApplicants.every((applicant) => previous.has(applicant.applicationId));
      const next = new Set(previous);
      if (allSelected) {
        filteredApplicants.forEach((applicant) => next.delete(applicant.applicationId));
      } else {
        filteredApplicants.forEach((applicant) => next.add(applicant.applicationId));
      }
      return next;
    });
  }

  function handleBulkConfirm() {
    if (!pendingBulkTarget) return;
    const applicationIds = Array.from(selectedIds);
    if (applicationIds.length === 0) {
      setPendingBulkTarget(null);
      return;
    }
    setBulkError(null);
    bulkMutation.mutate(
      { applicationIds, status: pendingBulkTarget },
      {
        onSuccess: (result) => {
          setLastResult(result);
          setSelectedIds(new Set());
          setPendingBulkTarget(null);
        },
        onError: (mutationError) => {
          const message =
            mutationError instanceof ApiError ? mutationError.message : '일괄 처리에 실패했습니다.';
          setBulkError(message);
        },
      },
    );
  }

  if (isRecruitmentLoading || !recruitment) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 pb-24">
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-1">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 모집 상세로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-slate-900">{recruitment.title} — 지원자 관리</h1>
      </div>

      {/* 외부 폼 안내 */}
      {recruitment.applicationMode === 'EXTERNAL' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center">
          <p className="text-sm text-slate-600">
            외부 폼 응답은 외부 시스템에서 확인하세요.
          </p>
          {recruitment.externalFormUrl && (
            <a
              href={recruitment.externalFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-sky-600 hover:underline"
            >
              외부 폼 바로가기 →
            </a>
          )}
        </div>
      )}

      {/* 자체 폼 지원자 표 */}
      {recruitment.applicationMode === 'SELF' && (
        <>
          {/* 상태 필터 칩 */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setStatusFilter(option.value);
                  setSelectedIds(new Set());
                }}
                className={
                  statusFilter === option.value
                    ? 'rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white'
                    : 'rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50'
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* 직전 일괄 처리 결과 */}
          {lastResult && (
            <div
              className={
                lastResult.failures.length === 0
                  ? 'mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                  : 'mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    일괄 처리 완료: {lastResult.updated}건 성공
                    {lastResult.failures.length > 0 && ` · ${lastResult.failures.length}건 실패`}
                  </div>
                  {lastResult.failures.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {lastResult.failures.slice(0, 5).map((failure) => (
                        <li key={failure.applicationId}>
                          ID {failure.applicationId}: {failure.reason}
                        </li>
                      ))}
                      {lastResult.failures.length > 5 && (
                        <li>외 {lastResult.failures.length - 5}건…</li>
                      )}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLastResult(null)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  닫기
                </button>
              </div>
            </div>
          )}

          {/* 호출 자체 실패 (네트워크 등) */}
          {bulkError && (
            <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {bulkError}
            </p>
          )}

          {isApplicantsLoading && (
            <p className="mt-6 text-sm text-slate-500">지원자 목록 불러오는 중…</p>
          )}

          {!isApplicantsLoading && (
            <ApplicantTable
              applicants={filteredApplicants}
              selectedIds={selectedIds}
              onToggleOne={toggleOne}
              onToggleAll={toggleAll}
              onDetailOpen={(applicationId) => setSelectedApplicationId(applicationId)}
            />
          )}
        </>
      )}

      {/* 지원자 상세 모달 */}
      {selectedApplicationId !== null && (
        <ApplicantDetailModal
          applicationId={selectedApplicationId}
          recruitmentId={recruitmentId}
          useInterview={recruitment.useInterview}
          onClose={() => setSelectedApplicationId(null)}
        />
      )}

      {/* 일괄 처리 sticky bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        isPending={bulkMutation.isPending}
        onConfirm={(target) => setPendingBulkTarget(target)}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* 일괄 처리 확인 dialog */}
      {pendingBulkTarget && (
        <BulkConfirmDialog
          targetStatus={pendingBulkTarget}
          selectedCount={selectedIds.size}
          isPending={bulkMutation.isPending}
          onConfirm={handleBulkConfirm}
          onCancel={() => setPendingBulkTarget(null)}
        />
      )}

      {/* PII 고지 */}
      <footer className="mt-10 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
        본 정보는 합격 결정 외 용도로 사용하지 않습니다
      </footer>
    </div>
  );
}
