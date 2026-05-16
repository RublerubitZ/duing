'use client';

import type { Applicant, ApplicationStatus } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';

const STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'bg-sky-100 text-sky-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-700',
  INTERVIEW_PENDING: 'bg-purple-100 text-purple-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
};

type ApplicantTableProps = {
  applicants: Applicant[];
  onDetailOpen: (applicationId: number) => void;
};

export function ApplicantTable({ applicants, onDetailOpen }: ApplicantTableProps) {
  if (applicants.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">해당 상태의 지원자가 없습니다.</p>;
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600">이름</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">학번</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">상태</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">지원일</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">면접일</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">액션</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {applicants.map((applicant) => (
            <tr key={applicant.applicationId} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{applicant.userName}</td>
              <td className="px-4 py-3 text-slate-600">{applicant.studentId}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[applicant.status]}`}
                >
                  {APPLICATION_STATUS_LABEL[applicant.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {new Date(applicant.submittedAt).toLocaleDateString('ko-KR')}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {applicant.status === 'INTERVIEW_PENDING'
                  ? '—'
                  : '—'}
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onDetailOpen(applicant.applicationId)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  상세
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}