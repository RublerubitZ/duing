'use client';

import type { ApplicantDetail } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';

export function ApplicantProfilePanel({ detail }: { detail: ApplicantDetail }) {
  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">지원자 정보</h2>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-neutral-500">이름</dt>
        <dd className="text-slate-900">{detail.applicant.name}</dd>

        <dt className="text-neutral-500">학번</dt>
        <dd className="text-slate-900">{detail.applicant.studentId}</dd>

        <dt className="text-neutral-500">학과</dt>
        <dd className="text-slate-900">
          {COLLEGE_DISPLAY_NAME[detail.applicant.college]} · {detail.applicant.major}
        </dd>

        <dt className="text-neutral-500">학년</dt>
        <dd className="text-slate-900">{GRADE_DISPLAY_NAME[detail.applicant.grade]}</dd>

        <dt className="text-neutral-500">이메일</dt>
        <dd className="text-slate-900">{detail.applicant.email}</dd>

        <dt className="text-neutral-500">지원일시</dt>
        <dd className="text-slate-900">
          {new Date(detail.submittedAt).toLocaleString('ko-KR')}
        </dd>

        {detail.interview && (
          <>
            <dt className="text-neutral-500">면접일정</dt>
            <dd className="text-slate-900">
              {new Date(detail.interview.startAt).toLocaleString('ko-KR')}
              {' · '}
              {detail.interview.location}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
