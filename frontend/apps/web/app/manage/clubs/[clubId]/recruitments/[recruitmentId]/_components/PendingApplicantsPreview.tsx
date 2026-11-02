'use client';

import { useId } from 'react';
import Link from 'next/link';
import { useApplicantsQuery } from '@duing/hooks';
import { daysSinceKst } from '@duing/hooks/datetime';
import { GRADE_DISPLAY_NAME } from '@duing/types';
import { APPLICATION_STATUS_OPERATOR_LABEL } from '@/app/_constants/application-status';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { pendingDaysChip } from '@/app/manage/_components/dashboard/dashboardTaskPresentation';
import { DASHBOARD_CHIP_TONE_CLASS } from '@/components/dashboard/dashboardChipTone';
import { Skeleton } from '@/components/loading/Skeleton';
import type { Applicant } from '@duing/types';

const PREVIEW_LIMIT = 3;
const SUBMITTED_FILTER = { status: 'SUBMITTED' } as const;

/** 제출이 오래된 순 — 서버는 최근 순(desc)이고 같은 시각의 보조 정렬이 없어 화면에서 정한다. */
export function oldestSubmittedFirst(applicants: Applicant[]): Applicant[] {
  return [...applicants].sort(
    (left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt) || left.applicationId - right.applicationId,
  );
}

type PendingApplicantsPreviewProps = {
  clubId: number;
  recruitmentId: number;
  /** 통계 요약의 지원 완료 수 — "모두 보기" 조건·수. 할 일 줄 둘째 줄과 같은 출처라 카드 안 숫자가 맞는다. */
  submittedCount: number;
  now: Date;
};

/** 모집 상세 "먼저 볼 지원서" — 지원 완료(SUBMITTED) 중 가장 오래 기다린 3명. */
export function PendingApplicantsPreview({ clubId, recruitmentId, submittedCount, now }: PendingApplicantsPreviewProps) {
  const headingId = useId();
  const applicantsQuery = useApplicantsQuery(recruitmentId, SUBMITTED_FILTER);
  // 이전 조회의 목록(keepPreviousData)은 쓰지 않는다 — 다른 모집·필터의 이름이 잠깐 보이지 않게.
  const applicants = applicantsQuery.isPlaceholderData ? undefined : applicantsQuery.data;
  const applicantsHref = `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants` as const;

  if (applicants !== undefined && applicants.length === 0) return null;
  const rows = applicants === undefined ? [] : oldestSubmittedFirst(applicants).slice(0, PREVIEW_LIMIT);

  return (
    <section aria-labelledby={headingId} className="mt-3 border-t border-sage-soft pt-3">
      <h3 id={headingId} className="px-2 pb-1 text-xs font-bold text-charcoal-2">먼저 볼 지원서</h3>
      {applicants === undefined ? (
        applicantsQuery.isError ? (
          <p className="px-2 py-2 text-sm text-charcoal-3">지원서를 불러오지 못했어요.</p>
        ) : (
          <div className="animate-pulse space-y-1 motion-reduce:animate-none">
            {Array.from({ length: Math.min(PREVIEW_LIMIT, submittedCount) }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        )
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {rows.map((applicant) => {
              const chip = pendingDaysChip(daysSinceKst(applicant.submittedAt, now));
              const grade = GRADE_DISPLAY_NAME[applicant.grade];
              return (
                <li key={applicant.applicationId}>
                  <Link
                    href={toRoute(`${applicantsHref}/${applicant.applicationId}?status=SUBMITTED`)}
                    className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 transition hover:bg-sage-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <span className="min-w-0 flex-1 basis-48 break-keep">
                      <span className="text-sm font-medium text-charcoal">{applicant.userName}</span>{' '}
                      <span className="text-xs text-charcoal-3">{applicant.major ? `${applicant.major} · ${grade}` : grade}</span>
                    </span>{' '}
                    <span className="ml-auto flex items-center gap-2">
                      <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', DASHBOARD_CHIP_TONE_CLASS[chip.tone])}>
                        {chip.text}
                      </span>{' '}
                      <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-ink">지원서 보기</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {submittedCount > rows.length ? (
            <Link
              href={toRoute(`${applicantsHref}?status=SUBMITTED`)}
              className="mt-1 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              {`${APPLICATION_STATUS_OPERATOR_LABEL.SUBMITTED} ${submittedCount}명 모두 보기`}
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
