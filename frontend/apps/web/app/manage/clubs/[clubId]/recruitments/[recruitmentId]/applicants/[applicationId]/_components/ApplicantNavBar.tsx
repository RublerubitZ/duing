'use client';

import Link from 'next/link';
import { cn } from '@/app/_lib/cn';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useApplicantNeighborsQuery } from '@duing/hooks';
import type { ApplicantsFilters, ApplicationStatus } from '@duing/types';
import {
  APPLICATION_STATUS_BADGE_CLASS,
  APPLICATION_STATUS_LABEL,
} from '../../../../../../../../_constants/application-status';
import { toRoute } from '../../../../../../../../_lib/route';

type Props = {
  clubId: number;
  recruitmentId: number;
  applicationId: number;
  filters: ApplicantsFilters;
  currentStatus: ApplicationStatus;
};

export function ApplicantNavBar({
  clubId,
  recruitmentId,
  applicationId,
  filters,
  currentStatus,
}: Props) {
  const router = useGuardedRouter();
  const { data: neighbors } = useApplicantNeighborsQuery(recruitmentId, applicationId, filters);

  const qs = filtersToQuery(filters);

  const prevId = neighbors?.prevApplicationId;
  const nextId = neighbors?.nextApplicationId;

  const prevBase = prevId
    ? `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${prevId}`
    : undefined;
  const prevHref = prevBase ? (qs ? `${prevBase}?${qs}` : prevBase) : undefined;

  const nextBase = nextId
    ? `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${nextId}`
    : undefined;
  const nextHref = nextBase ? (qs ? `${nextBase}?${qs}` : nextBase) : undefined;

  return (
    // flex-wrap: 320px 에서 상태 pill 이 다음 줄로 내려가 찌그러지지 않게 한다.
    <nav aria-label="지원자 탐색" className="card flex flex-wrap items-center gap-2 p-3">
      <Link
        href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants${qs ? `?${qs}` : ''}`)}
        className="inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-sm text-charcoal-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {/* 화살표는 장식 — aria-hidden 으로 빼야 SR 이 "홑화살괄호 목록"으로 읽지 않는다. */}
        <span aria-hidden="true">←</span> 목록
      </Link>
      <button
        type="button"
        disabled={!prevHref}
        onClick={() => {
          if (prevHref) {
            router.push(toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${prevId}${qs ? `?${qs}` : ''}`));
          }
        }}
        className={cn(NAV_BUTTON_CLASS, 'ml-3')}
      >
        <span aria-hidden="true">‹</span> 이전
      </button>
      <button
        type="button"
        disabled={!nextHref}
        onClick={() => {
          if (nextHref) {
            router.push(toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${nextId}${qs ? `?${qs}` : ''}`));
          }
        }}
        className={NAV_BUTTON_CLASS}
      >
        다음 <span aria-hidden="true">›</span>
      </button>
      <span
        className={cn(
          APPLICATION_STATUS_BADGE_CLASS[currentStatus],
          'ml-auto shrink-0 px-2 py-0.5 text-[11px]',
        )}
      >
        {APPLICATION_STATUS_LABEL[currentStatus]}
      </span>
    </nav>
  );
}

/**
 * 이전/다음 공통 외형 — 첫/마지막 지원자에서는 네이티브 disabled 로 남긴다.
 * 비활성 컨트롤은 1.4.3 대비 예외지만 opacity-40 은 너무 흐려 50 으로 완화했다.
 */
const NAV_BUTTON_CLASS =
  'inline-flex min-h-11 items-center gap-1 rounded-sm border border-line px-3 text-sm text-charcoal-2 hover:border-sage disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function filtersToQuery(filters: ApplicantsFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.college) params.set('college', filters.college);
  if (filters.q) params.set('q', filters.q);
  if (filters.submittedFrom) params.set('submittedFrom', filters.submittedFrom);
  if (filters.submittedTo) params.set('submittedTo', filters.submittedTo);
  return params.toString();
}
