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
import { isApplicationStatus, isCollege } from '@duing/types';
import {
  useRecruitmentDetailQuery,
  useApplicantsQuery,
  useBulkUpdateApplicationStatusMutation,
} from '@duing/hooks';
import { safeExternalHref, toRoute } from '@/app/_lib/route';
import { ApplicantCardList } from './_components/ApplicantCardList';
import { ApplicantTable } from './_components/ApplicantTable';
import { ApplicantsFilterBar } from './_components/ApplicantsFilterBar';
import { BulkActionBar } from './_components/BulkActionBar';
import { BulkConfirmDialog } from './_components/BulkConfirmDialog';
import { BulkPromoteDialog } from './_components/BulkPromoteDialog';
import { RecruitmentSwitcher } from './_components/RecruitmentSwitcher';
import { SelectAllBar } from './_components/SelectAllBar';
import { countByStatus } from './_lib/applicantCounts';
import {
  actionableSelectedIds,
  selectableIds,
  selectAllState,
  toggleSelectAll,
} from './_lib/applicantSelection';
import { cn } from '@/app/_lib/cn';
import { LoadingGate } from '@/components/loading/LoadingGate';

/** URL 값이 알려진 enum 일 때만 필터로 인정한다 — 상세 화면(ApplicantDetailPage)과 같은 방식. */
function readStatusParam(raw: string | null): ApplicationStatus | undefined {
  return raw !== null && isApplicationStatus(raw) ? raw : undefined;
}

function readCollegeParam(raw: string | null): College | undefined {
  return raw !== null && isCollege(raw) ? raw : undefined;
}

type PageParams = { params: Promise<{ clubId: string; recruitmentId: string }> };

export default function ApplicantsPage({ params }: PageParams) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);

  const router = useGuardedRouter();
  const searchParams = useSearchParams();

  const filters = useMemo<ApplicantsFilters>(
    () => ({
      // 수기 URL·구버전 링크로 알 수 없는 값이 오면 필터 없음으로 떨어뜨린다 — 클라이언트 필터
      // 술어이자 칩 선택 상태를 겸하게 되어, 검증 없이 통과하면 "어떤 칩도 안 눌린 빈 목록" 이 된다.
      status: readStatusParam(searchParams.get('status')),
      college: readCollegeParam(searchParams.get('college')),
      q: searchParams.get('q') ?? undefined,
      submittedFrom: searchParams.get('submittedFrom') ?? undefined,
      submittedTo: searchParams.get('submittedTo') ?? undefined,
    }),
    [searchParams],
  );

  const { data: recruitment, isLoading: isRecruitmentLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );
  // 상태는 클라이언트에서 건다 — 칩 숫자가 현재 필터 결과 안의 분포와 항상 일치해야 한다(설계 §6).
  // URL 의 status 는 그대로 둔다: 상세 이전/다음 탐색을 서버가 같은 조건으로 계산한다.
  const listFilters = useMemo(() => ({ ...filters, status: undefined }), [filters]);
  const {
    data: allApplicants = [],
    isLoading: isApplicantsLoading,
    isFetching: isApplicantsFetching,
  } = useApplicantsQuery(
    recruitment?.applicationMode === 'SELF' && !isNaN(recruitmentId)
      ? recruitmentId
      : undefined,
    listFilters,
  );
  const counts = useMemo(() => countByStatus(allApplicants), [allApplicants]);
  const applicants = useMemo(
    () =>
      filters.status
        ? allApplicants.filter((applicant) => applicant.status === filters.status)
        : allApplicants,
    [allApplicants, filters.status],
  );
  const bulkMutation = useBulkUpdateApplicationStatusMutation(recruitmentId);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // allApplicants 를 의존성으로 쓰므로 목록 쿼리 아래에 둔다(위에 두면 의존성 배열이 TDZ 에 걸린다).
  const updateFilters = useCallback(
    (nextFilters: ApplicantsFilters) => {
      const nextParams = new URLSearchParams();
      if (nextFilters.status) nextParams.set('status', nextFilters.status);
      if (nextFilters.college) nextParams.set('college', nextFilters.college);
      if (nextFilters.q) nextParams.set('q', nextFilters.q);
      if (nextFilters.submittedFrom)
        nextParams.set('submittedFrom', nextFilters.submittedFrom);
      if (nextFilters.submittedTo) nextParams.set('submittedTo', nextFilters.submittedTo);

      // 검색어만 바뀐 경우는 선택을 건드리지 않는다 — 타이핑 한 글자에 선택이 영구 소실되고
      // 검색어를 지워도 복구되지 않는다(회원 관리와 같은 규칙).
      const onlyQueryChanged =
        nextFilters.status === filters.status &&
        nextFilters.college === filters.college &&
        nextFilters.submittedFrom === filters.submittedFrom &&
        nextFilters.submittedTo === filters.submittedTo;

      if (!onlyQueryChanged) {
        // 상태가 바뀌면 새 상태에 해당하는 선택만 남긴다(클라이언트에서 즉시 판정 가능).
        // 단과대·기간은 서버 필터라 새 결과를 아직 모르므로 비운다 — "보이지 않는 선택" 을
        // 남기지 않는 쪽으로 안전하게 기운다.
        const collegeOrPeriodChanged =
          nextFilters.college !== filters.college ||
          nextFilters.submittedFrom !== filters.submittedFrom ||
          nextFilters.submittedTo !== filters.submittedTo;
        setSelectedIds((current) =>
          collegeOrPeriodChanged
            ? []
            : current.filter((id) =>
                allApplicants.some(
                  (applicant) =>
                    applicant.applicationId === id &&
                    (!nextFilters.status || applicant.status === nextFilters.status),
                ),
              ),
        );
      }
      router.replace(`?${nextParams.toString()}`);
    },
    [router, filters, allApplicants],
  );

  const detailHref = useCallback(
    (applicationId: number) => {
      const currentQs = searchParams.toString();
      // 템플릿 리터럴을 const 로 받으면 string 으로 넓어져 toRoute 의 `/${string}` 에 안 맞는다.
      const base: `/${string}` = `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${applicationId}`;
      return toRoute(currentQs ? `${base}?${currentQs}` : base);
    },
    [searchParams, clubId, recruitmentId],
  );
  const openDetail = useCallback(
    (applicationId: number) => router.push(detailHref(applicationId)),
    [router, detailHref],
  );
  const toggleOne = useCallback((applicationId: number) => {
    setSelectedIds((current) =>
      current.includes(applicationId)
        ? current.filter((id) => id !== applicationId)
        : [...current, applicationId],
    );
  }, []);
  // 전체 선택의 분모는 언제나 선택 가능한(비최종) 지원자다.
  const selectable = useMemo(() => selectableIds(applicants), [applicants]);
  const allState = useMemo(
    () => selectAllState(selectedSet, selectable),
    [selectedSet, selectable],
  );
  const toggleAll = useCallback(
    () => setSelectedIds(toggleSelectAll(selectable, allState)),
    [selectable, allState],
  );
  /*
   * 일괄 처리에 실제로 실을 대상 — 지금 화면에 보이고 선택 가능한 것만.
   * 검색어가 바뀌어도 선택을 지우지 않는 규칙(updateFilters)과 반드시 짝을 이룬다. 짝이 없으면
   * "김" 으로 5명 고르고 "박" 으로 바꿔 2명을 더 고를 때, 화면에 없는 김씨 5명까지 함께 처리된다.
   * 합격·불합격은 되돌릴 수 없다. 회원 관리 벌크 툴바도 같은 교집합으로 실행한다.
   */
  const actionableIds = useMemo(
    () => actionableSelectedIds(selectable, selectedSet),
    [selectable, selectedSet],
  );

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
  // 마감(raw CLOSED) 모집은 남은 지원서의 최종 결과 확정만 허용된다 (스펙 §1-3 개정).
  // displayStatus 가 아니라 raw status 라, 마감일이 지났어도 수동 마감 전이면 전 기능이 유지된다.
  const isFinalizeOnly = recruitment?.status === 'CLOSED';

  function handleBulkConfirm() {
    if (!pendingBulkTarget || actionableIds.length === 0) {
      setPendingBulkTarget(null);
      return;
    }
    setBulkError(null);
    bulkMutation.mutate(
      { applicationIds: actionableIds, status: pendingBulkTarget },
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
    if (actionableIds.length === 0) {
      setIsPromoteDialogOpen(false);
      return;
    }
    setBulkError(null);
    bulkMutation.mutate(
      { applicationIds: actionableIds, status: 'INTERVIEW_PENDING' },
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
    if (actionableIds.length === 0) return '';
    const firstSelected = applicants.find((applicant) =>
      selectedSet.has(applicant.applicationId),
    );
    return firstSelected?.userName ?? '';
  }, [applicants, actionableIds, selectedSet]);

  const hasActiveFilters = Object.values(filters).some(Boolean);

  if (isRecruitmentLoading || !recruitment) {
    return <LoadingGate label="모집 정보 불러오는 중" />;
  }

  return (
    <div
      className={cn(
        'mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10',
        actionableIds.length > 0
          ? 'pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-24'
          : 'pb-10',
      )}
    >
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-1">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
          className="text-sm text-charcoal-3 hover:text-charcoal"
        >
          ← 모집 상세로 돌아가기
        </Link>
        {/* 모집 제목은 전환 드롭다운이 현재 선택값으로 들고 있다 — 제목을 h1 에 겹쳐 쓰지 않는다.
            드롭다운이 걷히는 경우(외부 폼·목록 조회 실패)에도 제목은 폴백으로 남는다. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-bold text-ink-deep">지원자 관리</h1>
          <RecruitmentSwitcher
            clubId={clubId}
            currentRecruitmentId={recruitmentId}
            fallbackTitle={recruitment.title}
          />
        </div>
      </div>

      {/* 마감 아카이브 배너 — 남은 조치가 최종 결과 확정뿐임을 먼저 알린다 */}
      {isFinalizeOnly && (
        <div
          role="status"
          className="mb-4 rounded-md border border-line bg-graysoft/40 px-3 py-2 text-sm text-charcoal-2"
        >
          마감된 모집 — 남은 지원서의 최종 결과만 확정할 수 있습니다.
        </div>
      )}

      {/* 외부 폼 안내 — 지원서를 두잉에서 받지 않으므로 목록 대신 안내와 되돌아갈 길만 준다(§5.1) */}
      {recruitment.applicationMode === 'EXTERNAL' && (
        <div className="rounded-xl border border-line bg-graysoft/40 px-6 py-8 text-center">
          <p className="text-sm text-charcoal-2">
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
            counts={counts}
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
                  className="text-xs text-charcoal-3 hover:text-charcoal"
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
            <p className="mt-8 py-8 text-center text-charcoal-3">
              {hasActiveFilters ? '검색 결과 없음' : '지원자가 아직 없습니다'}
            </p>
          ) : (
            // 필터 전환 중에는 이전 결과를 그대로 두고 딤으로만 갱신을 알린다 — 목록이 비었다
            // 다시 차오르면 스크롤과 선택 맥락이 끊긴다.
            <div
              aria-busy={isApplicantsFetching}
              className={cn(isApplicantsFetching && 'opacity-60 transition-opacity')}
            >
              {/* 목록이 0건이면 위 빈 상태 분기로 빠져 이 블록 자체가 렌더되지 않는다. */}
              <SelectAllBar
                selectableCount={selectable.length}
                selectedCount={actionableIds.length}
                state={allState}
                onToggleAll={toggleAll}
              />
              <ApplicantCardList
                applicants={applicants}
                selectedSet={selectedSet}
                onToggleSelect={toggleOne}
                onOpenDetail={openDetail}
                detailHref={detailHref}
              />
              <ApplicantTable
                applicants={applicants}
                selectedSet={selectedSet}
                onToggleSelect={toggleOne}
                onToggleAll={toggleAll}
                onOpenDetail={openDetail}
                detailHref={detailHref}
                useInterview={useInterview}
              />
            </div>
          )}
        </>
      )}

      {/* 일괄 처리 sticky bar */}
      <BulkActionBar
        selectedCount={actionableIds.length}
        onBulkAction={setPendingBulkTarget}
        onPromoteToInterview={() => setIsPromoteDialogOpen(true)}
        useInterview={useInterview}
        finalizeOnly={isFinalizeOnly}
      />

      {/* 일괄 처리 확인 dialog (ON_HOLD / ACCEPTED / REJECTED) */}
      {pendingBulkTarget && (
        <BulkConfirmDialog
          targetStatus={pendingBulkTarget}
          selectedCount={actionableIds.length}
          isPending={bulkMutation.isPending}
          onConfirm={handleBulkConfirm}
          onCancel={() => setPendingBulkTarget(null)}
        />
      )}

      {/* 면접 대상 선정 dialog (Spec P0-4) */}
      {isPromoteDialogOpen && (
        <BulkPromoteDialog
          representativeName={promoteRepresentativeName}
          selectedCount={actionableIds.length}
          isPending={bulkMutation.isPending}
          onConfirm={handlePromoteConfirm}
          onCancel={() => setIsPromoteDialogOpen(false)}
        />
      )}

      {/* PII 고지 */}
      <footer className="mt-10 pt-4 text-center text-xs text-charcoal-3">
        본 정보는 합격 결정 외 용도로 사용하지 않습니다
      </footer>
    </div>
  );
}
