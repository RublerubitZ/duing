'use client';

import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { formatDateKst, formatDateTimeKst } from '@duing/hooks';
import type { Applicant, ApplicationStatus } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';
import { toRoute } from '../../../../../../../_lib/route';

const STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'bg-sky-100 text-sky-700',
  ON_HOLD: 'bg-amber-100 text-amber-700',
  INTERVIEW_PENDING: 'bg-purple-100 text-purple-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
};

function isTerminalStatus(status: ApplicationStatus): boolean {
  return status === 'ACCEPTED' || status === 'REJECTED';
}

function MyScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-neutral-400">—</span>;
  const colorClass =
    score >= 4
      ? 'bg-emerald-100 text-emerald-700'
      : score === 3
        ? 'bg-neutral-100 text-neutral-700'
        : 'bg-rose-100 text-rose-700';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${colorClass}`}>
      {score} / 5
    </span>
  );
}

type Props = {
  applicants: Applicant[];
  selectedIds: number[];
  selectedSet: ReadonlySet<number>;
  onSelect: (next: number[]) => void;
  useInterview: boolean;
  clubId: number;
  recruitmentId: number;
};

export function ApplicantTable({
  applicants,
  selectedIds,
  selectedSet,
  onSelect,
  useInterview,
  clubId,
  recruitmentId,
}: Props) {
  const router = useGuardedRouter();
  const searchParams = useSearchParams();

  const toggleRow = (applicationId: number, status: ApplicationStatus) => {
    if (isTerminalStatus(status)) return;
    const isSelected = selectedSet.has(applicationId);
    onSelect(
      isSelected
        ? selectedIds.filter((id) => id !== applicationId)
        : [...selectedIds, applicationId],
    );
  };

  const navigateToDetail = (applicationId: number) => {
    const currentQs = searchParams.toString();
    if (currentQs) {
      router.push(
        toRoute(
          `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${applicationId}?${currentQs}`,
        ),
      );
    } else {
      router.push(
        toRoute(
          `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${applicationId}`,
        ),
      );
    }
  };

  return (
    <>
    {/* 데스크탑/태블릿: 표 (모바일은 아래 카드 리스트) */}
    <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="w-10 px-4 py-3" />
            <th className="px-4 py-3 text-left font-medium text-slate-600">이름</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">학과</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">학번</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">학년</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">지원일시</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">상태</th>
            {useInterview && (
              <th className="px-4 py-3 text-left font-medium text-slate-600">면접일정</th>
            )}
            <th className="px-4 py-3 text-left font-medium text-slate-600">내 점수</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {applicants.map((applicant) => {
            const isTerminal = isTerminalStatus(applicant.status);
            const isSelected = selectedSet.has(applicant.applicationId);
            return (
              <tr
                key={applicant.applicationId}
                onClick={() => navigateToDetail(applicant.applicationId)}
                className={`cursor-pointer hover:bg-slate-50 ${isSelected ? 'bg-slate-50' : ''}`}
              >
                <td
                  className="px-4 py-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label={`${applicant.userName} 선택`}
                    checked={isSelected}
                    disabled={isTerminal}
                    onChange={() => toggleRow(applicant.applicationId, applicant.status)}
                    title={
                      isTerminal
                        ? '최종 상태인 지원자는 선택할 수 없습니다.'
                        : undefined
                    }
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{applicant.userName}</td>
                <td className="px-4 py-3 text-slate-600">
                  {COLLEGE_DISPLAY_NAME[applicant.college]} · {applicant.major}
                </td>
                <td className="px-4 py-3 text-slate-600">{applicant.studentId}</td>
                <td className="px-4 py-3 text-slate-600">{GRADE_DISPLAY_NAME[applicant.grade]}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDateTimeKst(applicant.submittedAt)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[applicant.status]}`}
                  >
                    {APPLICATION_STATUS_LABEL[applicant.status]}
                  </span>
                </td>
                {useInterview && (
                  <td className="px-4 py-3 text-slate-600">
                    {applicant.interviewStartAt
                      ? formatDateTimeKst(applicant.interviewStartAt)
                      : '—'}
                  </td>
                )}
                <td className="px-4 py-3">
                  <MyScoreBadge score={applicant.myScore} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

      {/* 모바일: 카드 리스트 (표 대신) */}
      <div className="mt-4 space-y-2.5 md:hidden">
        {applicants.map((applicant) => {
          const isTerminal = isTerminalStatus(applicant.status);
          const isSelected = selectedSet.has(applicant.applicationId);
          return (
            <div
              key={applicant.applicationId}
              onClick={() => navigateToDetail(applicant.applicationId)}
              className={`cursor-pointer rounded-xl border p-3.5 transition ${
                isSelected ? 'border-slate-400 bg-slate-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  aria-label={`${applicant.userName} 선택`}
                  checked={isSelected}
                  disabled={isTerminal}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggleRow(applicant.applicationId, applicant.status)}
                  title={isTerminal ? '최종 상태인 지원자는 선택할 수 없습니다.' : undefined}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-slate-900">{applicant.userName}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[applicant.status]}`}
                    >
                      {APPLICATION_STATUS_LABEL[applicant.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-[12.5px] text-slate-600">
                    {COLLEGE_DISPLAY_NAME[applicant.college]} · {applicant.major}
                  </div>
                  <div className="text-[12px] text-slate-500">
                    학번 {applicant.studentId} · {GRADE_DISPLAY_NAME[applicant.grade]}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 pt-2 text-[11.5px] text-slate-500">
                    <span>지원 {formatDateKst(applicant.submittedAt)}</span>
                    <MyScoreBadge score={applicant.myScore} />
                  </div>
                  {useInterview && (
                    <div className="mt-1 text-[11.5px] text-slate-500">
                      면접{' '}
                      {applicant.interviewStartAt
                        ? formatDateTimeKst(applicant.interviewStartAt)
                        : '—'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
