'use client';

import { useState } from 'react';
import { useInterviewRoundCandidatesQuery } from '@duing/hooks';
import type { InterviewRoundCandidate } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { APPLICATION_STATUS_OPERATOR_LABEL } from '@/app/_constants/application-status';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';

// Step1: 면접 라운드 대상 후보 선정 (ephemeral — 서버에 저장하지 않음).
// 서류 검토 중(UNDER_REVIEW) / 면접 대기(INTERVIEW_PENDING) 그룹 헤더로 분리.
// 기본 includeUnderReview=true (정기 wizard 진입 §10.3).
//
// 선택 상태는 RoundWizard 가 Map<number, InterviewRoundCandidate> 로 보유.
// 토글로 화면에서 필터링돼도 이미 선택된 UNDER_REVIEW 후보는 맵에서 유지된다.
// 토글 off 상태에서도 UNDER_REVIEW 선택 항목을 하단에 칩으로 표시하고 개별 해제 가능.

const STATUS_BADGE_CLASS: Record<string, string> = {
  UNDER_REVIEW: 'bg-amber-100 text-amber-700',
  INTERVIEW_PENDING: 'bg-purple-100 text-purple-700',
};

type Props = {
  recruitmentId: number;
  /** applicationId → 선택된 후보 레코드 (RoundWizard 보유) */
  selectedMap: Map<number, InterviewRoundCandidate>;
  onSelectionMapChange: (nextMap: Map<number, InterviewRoundCandidate>) => void;
  onNext: () => void;
};

export function Step1Candidates({
  recruitmentId,
  selectedMap,
  onSelectionMapChange,
  onNext,
}: Props) {
  const [includeUnderReview, setIncludeUnderReview] = useState(true);
  const candidatesQuery = useInterviewRoundCandidatesQuery(recruitmentId, includeUnderReview);

  const candidates = candidatesQuery.data ?? [];

  const underReviewCandidates = candidates.filter(
    (candidate) => candidate.status === 'UNDER_REVIEW',
  );
  const interviewPendingCandidates = candidates.filter(
    (candidate) => candidate.status === 'INTERVIEW_PENDING',
  );

  const toggleCandidate = (candidate: InterviewRoundCandidate) => {
    const next = new Map(selectedMap);
    if (next.has(candidate.applicationId)) {
      next.delete(candidate.applicationId);
    } else {
      next.set(candidate.applicationId, candidate);
    }
    onSelectionMapChange(next);
  };

  const toggleAll = (group: InterviewRoundCandidate[], checked: boolean) => {
    const next = new Map(selectedMap);
    if (checked) {
      for (const candidate of group) {
        next.set(candidate.applicationId, candidate);
      }
    } else {
      for (const candidate of group) {
        next.delete(candidate.applicationId);
      }
    }
    onSelectionMapChange(next);
  };

  // 현재 화면에 없는 선택된 UNDER_REVIEW 후보 (토글 off 시 보존 안내용)
  const visibleIds = new Set(candidates.map((candidate) => candidate.applicationId));
  const hiddenSelectedUnderReview = Array.from(selectedMap.values()).filter(
    (candidate) => candidate.status === 'UNDER_REVIEW' && !visibleIds.has(candidate.applicationId),
  );

  const canProceed = selectedMap.size > 0;

  const renderGroup = (
    groupLabel: string,
    groupCandidates: InterviewRoundCandidate[],
  ) => {
    if (groupCandidates.length === 0) return null;

    const allSelected = groupCandidates.every((candidate) =>
      selectedMap.has(candidate.applicationId),
    );

    return (
      <div key={groupLabel} className="space-y-2">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
          <input
            type="checkbox"
            id={`group-all-${groupLabel}`}
            checked={allSelected}
            onChange={(event) => toggleAll(groupCandidates, event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
            aria-label={`${groupLabel} 전체 선택`}
          />
          <h3 className="text-sm font-semibold text-slate-700">{groupLabel}</h3>
          <span className="text-xs text-slate-400">({groupCandidates.length}명)</span>
        </div>
        <ul className="space-y-1">
          {groupCandidates.map((candidate) => {
            const isSelected = selectedMap.has(candidate.applicationId);
            const badgeClass =
              STATUS_BADGE_CLASS[candidate.status] ?? 'bg-slate-100 text-slate-700';
            const statusLabel =
              APPLICATION_STATUS_OPERATOR_LABEL[candidate.status] ??
              candidate.status;

            return (
              <li
                key={candidate.applicationId}
                className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-slate-50', isSelected && 'bg-slate-50')}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleCandidate(candidate)}
                  aria-label={`${candidate.userName} 선택`}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="font-medium text-slate-900">{candidate.userName}</span>
                <span className="text-slate-500">
                  {COLLEGE_DISPLAY_NAME[candidate.college]} · {candidate.major}
                </span>
                <span className="text-slate-400">{GRADE_DISPLAY_NAME[candidate.grade]}</span>
                <span className={cn('ml-auto rounded-full px-2 py-0.5 text-xs font-medium', badgeClass)}>
                  {statusLabel}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (candidatesQuery.isLoading) {
    return <p className="p-4 text-sm text-slate-500">후보 목록을 불러오는 중…</p>;
  }

  if (candidatesQuery.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-rose-600">
        후보 목록을 불러오지 못했습니다.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">대상 선정</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            aria-label="서류 검토 중 포함"
            checked={includeUnderReview}
            onChange={(event) => setIncludeUnderReview(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          서류 검토 중 포함
        </label>
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-slate-500">후보가 없습니다.</p>
      ) : (
        <div className="space-y-4">
          {renderGroup('서류 검토 중', underReviewCandidates)}
          {renderGroup('면접 대기', interviewPendingCandidates)}
        </div>
      )}

      {/* 토글 off 상태에서 화면에 안 보이지만 이미 선택된 UNDER_REVIEW 후보 안내 */}
      {hiddenSelectedUnderReview.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-700">
            화면에 표시되지 않지만 선택된 서류 검토 중 후보 {hiddenSelectedUnderReview.length}명:
          </p>
          <ul className="flex flex-wrap gap-1">
            {hiddenSelectedUnderReview.map((candidate) => (
              <li key={candidate.applicationId}>
                <button
                  type="button"
                  onClick={() => toggleCandidate(candidate)}
                  aria-label={`${candidate.userName} 선택 해제`}
                  className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-200"
                >
                  {candidate.userName}
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <span className="text-sm text-slate-600">
          {selectedMap.size > 0 ? (
            <>
              {selectedMap.size}명 선택
              {hiddenSelectedUnderReview.length > 0 && (
                <span className="ml-1 text-amber-600">
                  (서류 검토 중 {hiddenSelectedUnderReview.length}명 포함)
                </span>
              )}
            </>
          ) : (
            '후보를 선택하세요'
          )}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  );
}
