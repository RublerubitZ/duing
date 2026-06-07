'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Applicant, ApplicationStatus } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';
import { COLLEGE_LABEL, GRADE_LABEL } from '../_constants/college-grade';
import { toRoute } from '../../../../../../../_lib/route';

const STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'bg-sky-100 text-sky-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-700',
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
  onSelect: (next: number[]) => void;
  useInterview: boolean;
  clubId: number;
  recruitmentId: number;
};

export function ApplicantTable({
  applicants,
  selectedIds,
  onSelect,
  useInterview,
  clubId,
  recruitmentId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (applicants.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">해당 조건의 지원자가 없습니다.</p>;
  }

  const toggleRow = (applicationId: number, status: ApplicationStatus) => {
    if (isTerminalStatus(status)) return;
    const isSelected = selectedIds.includes(applicationId);
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
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
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
            const isSelected = selectedIds.includes(applicant.applicationId);
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
                  {COLLEGE_LABEL[applicant.college]} · {applicant.major}
                </td>
                <td className="px-4 py-3 text-slate-600">{applicant.studentId}</td>
                <td className="px-4 py-3 text-slate-600">{GRADE_LABEL[applicant.grade]}</td>
                <td className="px-4 py-3 text-slate-600">
                  {new Date(applicant.submittedAt).toLocaleString('ko-KR')}
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
                    {applicant.interviewAt
                      ? new Date(applicant.interviewAt).toLocaleString('ko-KR')
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
  );
}
