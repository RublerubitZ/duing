'use client';

import { formatDateTimeKst } from '@duing/hooks';
import type { ApplicantDetail } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';

export function ApplicantProfilePanel({ detail }: { detail: ApplicantDetail }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-base font-semibold text-ink">지원자 정보</h2>
      {/* 고정 2열(50%)은 320px 에서 값 컬럼이 144px 로 좁아져 '단과대 · 전공' 이 넘친다.
          라벨은 내용폭, 값은 나머지 전부 + minmax(0)으로 그리드 블로우아웃 차단. */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-charcoal-3">이름</dt>
        <dd className="break-words text-charcoal-2">{detail.applicant.name}</dd>

        <dt className="text-charcoal-3">학번</dt>
        <dd className="break-words text-charcoal-2">{detail.applicant.studentId}</dd>

        <dt className="text-charcoal-3">학과</dt>
        <dd className="break-words text-charcoal-2">
          {COLLEGE_DISPLAY_NAME[detail.applicant.college]} · {detail.applicant.major}
        </dd>

        <dt className="text-charcoal-3">학년</dt>
        <dd className="break-words text-charcoal-2">{GRADE_DISPLAY_NAME[detail.applicant.grade]}</dd>

        <dt className="text-charcoal-3">휴대폰</dt>
        <dd className="break-words text-charcoal-2">{detail.applicant.phone}</dd>

        <dt className="text-charcoal-3">지원일시</dt>
        <dd className="break-words text-charcoal-2">
          {formatDateTimeKst(detail.submittedAt)}
        </dd>

        {detail.interview && (
          <>
            <dt className="text-charcoal-3">면접일정</dt>
            <dd className="break-words text-charcoal-2">
              {formatDateTimeKst(detail.interview.startAt)}
              {detail.interview.location && ` · ${detail.interview.location}`}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
