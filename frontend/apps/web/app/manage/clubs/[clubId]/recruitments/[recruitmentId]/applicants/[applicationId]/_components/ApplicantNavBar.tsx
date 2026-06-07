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

  const listHref = buildListHref(clubId, recruitmentId, filters);

  const prevHref = buildDetailHref(clubId, recruitmentId, neighbors?.prevApplicationId, filters);
  const nextHref = buildDetailHref(clubId, recruitmentId, neighbors?.nextApplicationId, filters);

  return (
    <nav className="flex items-center gap-2 rounded border border-neutral-200 bg-white p-3">
      <Link
        href={toRoute(listHref)}
        className="text-sm text-neutral-600 hover:underline"
      >
        ← 목록
      </Link>
      <button
        type="button"
        disabled={!prevHref}
        onClick={() => prevHref && router.push(toRoute(prevHref))}
        className="ml-3 rounded border border-neutral-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-40"
      >
        ‹ 이전
      </button>
      <button
        type="button"
        disabled={!nextHref}
        onClick={() => nextHref && router.push(toRoute(nextHref))}
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

function buildListHref(
  clubId: number,
  recruitmentId: number,
  filters: ApplicantsFilters,
): `/${string}` {
  const qs = filtersToQuery(filters);
  const base = `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants`;
  return qs ? `${base}?${qs}` : base;
}

function buildDetailHref(
  clubId: number,
  recruitmentId: number,
  targetId: number | null | undefined,
  filters: ApplicantsFilters,
): `/${string}` | undefined {
  if (!targetId) return undefined;
  const qs = filtersToQuery(filters);
  const base = `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${targetId}`;
  return qs ? `${base}?${qs}` : base;
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
