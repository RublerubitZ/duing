'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApplicantNeighborsQuery } from '@duing/hooks';
import type { ApplicantsFilters, ApplicationStatus } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../../_constants/application-status';
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
  const router = useRouter();
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
    <nav className="flex items-center gap-2 rounded border border-neutral-200 bg-white p-3">
      <Link
        href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants${qs ? `?${qs}` : ''}`)}
        className="text-sm text-neutral-600 hover:underline"
      >
        ← 목록
      </Link>
      <button
        type="button"
        disabled={!prevHref}
        onClick={() => {
          if (prevHref) {
            router.push(toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${prevId}${qs ? `?${qs}` : ''}`));
          }
        }}
        className="ml-3 rounded border border-neutral-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-40"
      >
        ‹ 이전
      </button>
      <button
        type="button"
        disabled={!nextHref}
        onClick={() => {
          if (nextHref) {
            router.push(toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${nextId}${qs ? `?${qs}` : ''}`));
          }
        }}
        className="rounded border border-neutral-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-40"
      >
        다음 ›
      </button>
      <span className="ml-auto rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
        {APPLICATION_STATUS_LABEL[currentStatus]}
      </span>
    </nav>
  );
}

function filtersToQuery(filters: ApplicantsFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.college) params.set('college', filters.college);
  if (filters.q) params.set('q', filters.q);
  if (filters.submittedFrom) params.set('submittedFrom', filters.submittedFrom);
  if (filters.submittedTo) params.set('submittedTo', filters.submittedTo);
  return params.toString();
}
