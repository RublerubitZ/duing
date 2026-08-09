'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { formatDateTimeKst } from '@duing/hooks';
import type { Applicant } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import {
  APPLICATION_STATUS_LABEL,
  isTerminalApplicationStatus,
} from '@/app/_constants/application-status';
import { STATUS_BADGE_CLASS } from '../_lib/applicantStatus';
import { selectableIds, selectAllState } from '../_lib/applicantSelection';

function MyScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-charcoal-3">—</span>;
  const colorClass =
    score >= 4
      ? 'bg-emerald-100 text-emerald-700'
      : score === 3
        ? 'bg-graysoft text-charcoal-2'
        : 'bg-rose-100 text-rose-700';
  return (
    <span
      className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs', colorClass)}
    >
      {score} / 5
    </span>
  );
}

type Props = {
  applicants: Applicant[];
  selectedSet: ReadonlySet<number>;
  onToggleSelect: (applicationId: number) => void;
  onToggleAll: () => void;
  onOpenDetail: (applicationId: number) => void;
  /** typedRoutes 라 Link 의 href 는 Route 여야 한다 — 페이지가 toRoute 로 만들어 내린다. */
  detailHref: (applicationId: number) => Route;
  useInterview: boolean;
};

/**
 * 데스크탑(≥1024px) 지원자 표. 1024~1279px 은 콘텐츠 폭이 672~927px 뿐이라
 * Secondary 열(단과대·학번)을 숨기고 xl(1280px) 이상에서만 노출한다(설계 §3).
 * overflow-x-auto 는 최후 방어선으로 남긴다 — 예외적으로 긴 학과명 하나에 페이지가 밀리면 안 된다.
 * 1280px 은 사이드바를 빼면 콘텐츠가 928px 뿐이라 9열이 빡빡하다. 이름·단과대·날짜처럼 식별에 쓰는
 * 값은 nowrap 으로 접힘을 막고(이서아가 "이서/아" 로 갈리면 스캔이 깨진다), 접힘은 가장 긴
 * 학과·학년 한 열에만 허용한다. 좁은 구간에서는 셀 패딩도 함께 줄인다.
 */
export function ApplicantTable({
  applicants,
  selectedSet,
  onToggleSelect,
  onToggleAll,
  onOpenDetail,
  detailHref,
  useInterview,
}: Props) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const selectable = selectableIds(applicants);
  const allState = selectAllState(selectedSet, selectable);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = allState === 'partial';
    }
  }, [allState]);

  return (
    <div className="mt-4 hidden overflow-x-auto rounded-lg border border-line bg-paper lg:block">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-cream text-left">
          <tr>
            <th className="w-12 px-3 py-3 xl:px-4">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                aria-label="전체 선택"
                checked={allState === 'all'}
                disabled={selectable.length === 0}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer rounded border-line text-ink focus:ring-sage disabled:cursor-not-allowed disabled:opacity-50"
              />
            </th>
            <th className="whitespace-nowrap px-3 py-3 font-medium text-charcoal-2 xl:px-4">지원자</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium text-charcoal-2 xl:px-4">상태</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium text-charcoal-2 xl:px-4">학과 · 학년</th>
            <th className="hidden whitespace-nowrap px-3 py-3 font-medium text-charcoal-2 xl:table-cell xl:px-4">단과대</th>
            <th className="hidden whitespace-nowrap px-3 py-3 font-medium text-charcoal-2 xl:table-cell xl:px-4">학번</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium text-charcoal-2 xl:px-4">지원일시</th>
            {useInterview && <th className="whitespace-nowrap px-3 py-3 font-medium text-charcoal-2 xl:px-4">면접일정</th>}
            <th className="whitespace-nowrap px-3 py-3 font-medium text-charcoal-2 xl:px-4">내 평가</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {applicants.map((applicant) => {
            const isTerminal = isTerminalApplicationStatus(applicant.status);
            const isSelected = selectedSet.has(applicant.applicationId);
            return (
              <tr
                key={applicant.applicationId}
                onClick={() => onOpenDetail(applicant.applicationId)}
                className={cn('cursor-pointer hover:bg-cream/60', isSelected && 'bg-cream/60')}
              >
                <td className="px-3 py-3 xl:px-4" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`${applicant.userName} 선택`}
                    checked={isSelected}
                    disabled={isTerminal}
                    onChange={() => onToggleSelect(applicant.applicationId)}
                    title={isTerminal ? '최종 상태인 지원자는 선택할 수 없습니다.' : undefined}
                    className="h-4 w-4 cursor-pointer rounded border-line text-ink focus:ring-sage disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </td>
                {/* 이름 링크가 키보드·스크린리더의 상세 진입로다. 행 onClick 과 겹치지 않게 전파를 끊는다. */}
                <td className="whitespace-nowrap px-3 py-3 xl:px-4">
                  <Link
                    href={detailHref(applicant.applicationId)}
                    onClick={(event) => event.stopPropagation()}
                    className="font-semibold text-ink-deep hover:underline"
                  >
                    {applicant.userName}
                  </Link>
                </td>
                <td className="px-3 py-3 xl:px-4">
                  <span
                    className={cn(
                      'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
                      STATUS_BADGE_CLASS[applicant.status],
                    )}
                  >
                    {APPLICATION_STATUS_LABEL[applicant.status]}
                  </span>
                </td>
                <td className="px-3 py-3 text-charcoal-2 xl:px-4">
                  {applicant.major} · {GRADE_DISPLAY_NAME[applicant.grade]}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-charcoal-3 xl:table-cell xl:px-4">
                  {COLLEGE_DISPLAY_NAME[applicant.college]}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-3 tabular-nums text-charcoal-3 xl:table-cell xl:px-4">
                  {applicant.studentId}
                </td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-charcoal-3 xl:px-4">
                  {formatDateTimeKst(applicant.submittedAt)}
                </td>
                {useInterview && (
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-charcoal-3 xl:px-4">
                    {applicant.interviewStartAt
                      ? formatDateTimeKst(applicant.interviewStartAt)
                      : '—'}
                  </td>
                )}
                <td className="px-3 py-3 xl:px-4">
                  <MyScoreBadge score={applicant.myScore} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
