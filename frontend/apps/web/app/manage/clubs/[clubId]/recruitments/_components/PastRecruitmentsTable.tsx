'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import type { RecruitmentSummary, StatsSummary } from '@duing/types';
import { statsQueryKeys, useApiClient } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import {
  recruitmentPeriodLabel,
  RECRUITMENT_DISPLAY_STATUS_BADGE,
  RECRUITMENT_DISPLAY_STATUS_LABEL,
} from '@/app/_lib/recruitmentDisplay';
import { recruitmentFlowLabel } from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel';
import {
  recruitmentClosedLabel,
  sortPastRecruitments,
} from '@/app/manage/clubs/[clubId]/_lib/sortPastRecruitments';

type Props = {
  clubId: number;
  recruitments: RecruitmentSummary[];
};

export function PastRecruitmentsTable({ clubId, recruitments: unsortedRecruitments }: Props) {
  const client = useApiClient();
  const recruitments = sortPastRecruitments(unsortedRecruitments);
  // 행별 지원/합격 집계 — 단일 소비처라 라우트 로컬 fan-out(대시보드 useApplicantSummary와 동일 패턴,
  // statsQueryKeys.summary 공유로 대시보드·상세·통계와 캐시 일치). 지난 모집은 클럽당 연 1~2건 수준.
  const summariesById = useQueries({
    queries: recruitments.map((recruitment) => ({
      queryKey: statsQueryKeys.summary(recruitment.id),
      queryFn: () => client.stats.summary(recruitment.id),
    })),
    combine: (results) => {
      const byId = new Map<number, StatsSummary>();
      results.forEach((result, index) => {
        const recruitment = recruitments[index];
        if (recruitment !== undefined && result.data !== undefined) {
          byId.set(recruitment.id, result.data);
        }
      });
      return byId;
    },
  });

  if (recruitments.length === 0) {
    return (
      <p className="rounded-md bg-graysoft py-6 text-center text-sm text-charcoal-3">
        아직 마감된 모집이 없어요.
      </p>
    );
  }

  function appliedAcceptedLabel(recruitmentId: number): string {
    const summary = summariesById.get(recruitmentId);
    return summary ? `${summary.total} / ${summary.accepted}` : '—';
  }

  return (
    <div className="card overflow-hidden">
      {/* 데스크탑: 표 */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-charcoal-2">모집</th>
              <th className="px-4 py-3 font-medium text-charcoal-2">기간</th>
              <th className="px-4 py-3 font-medium text-charcoal-2">지원 / 합격</th>
              <th className="px-4 py-3 font-medium text-charcoal-2">상태</th>
              <th className="px-4 py-3 text-right font-medium text-charcoal-2">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {recruitments.map((recruitment) => (
              <tr key={recruitment.id}>
                <td className="px-4 py-3">
                  <Link
                    href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
                    className="font-medium text-ink-deep hover:underline"
                  >
                    {recruitment.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-charcoal-3">
                    전형 {recruitmentFlowLabel(recruitment.useInterview)}
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums text-xs text-charcoal-2">
                  {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
                  {recruitmentClosedLabel(recruitment) !== null && (
                    <div className="mt-0.5 text-charcoal-3">{recruitmentClosedLabel(recruitment)}</div>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-charcoal">{appliedAcceptedLabel(recruitment.id)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${RECRUITMENT_DISPLAY_STATUS_BADGE[recruitment.displayStatus]}`}
                  >
                    {RECRUITMENT_DISPLAY_STATUS_LABEL[recruitment.displayStatus]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {recruitment.applicationMode === 'SELF' && (
                      <Link
                        href={toRoute(
                          `/manage/clubs/${clubId}/recruitments/${recruitment.id}/applicants`,
                        )}
                        className="btn btn-secondary btn-sm"
                      >
                        지원자
                      </Link>
                    )}
                    <Link
                      href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}/stats`)}
                      className="btn btn-secondary btn-sm"
                    >
                      결과 보기
                    </Link>
                    <Link
                      href={toRoute(`/manage/clubs/${clubId}/recruitments/new?cloneFrom=${recruitment.id}`)}
                      className="btn btn-ghost btn-sm"
                    >
                      양식 복제
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 리스트 */}
      <div className="divide-y divide-line md:hidden">
        {recruitments.map((recruitment) => (
          <div key={recruitment.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
                className="font-medium text-ink-deep hover:underline"
              >
                {recruitment.title}
              </Link>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RECRUITMENT_DISPLAY_STATUS_BADGE[recruitment.displayStatus]}`}
              >
                {RECRUITMENT_DISPLAY_STATUS_LABEL[recruitment.displayStatus]}
              </span>
            </div>
            <div className="mt-1 text-xs text-charcoal-3">
              {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
              {recruitmentClosedLabel(recruitment) !== null && ` · ${recruitmentClosedLabel(recruitment)}`} · 전형{' '}
              {recruitmentFlowLabel(recruitment.useInterview)}
            </div>
            <div className="mt-1 tabular-nums text-sm text-charcoal">
              지원 {appliedAcceptedLabel(recruitment.id)}
            </div>
            <div className="mt-3 flex gap-2">
              {recruitment.applicationMode === 'SELF' && (
                <Link
                  href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}/applicants`)}
                  className="btn btn-secondary btn-sm flex-1"
                >
                  지원자
                </Link>
              )}
              <Link
                href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}/stats`)}
                className="btn btn-secondary btn-sm flex-1"
              >
                결과 보기
              </Link>
              <Link
                href={toRoute(`/manage/clubs/${clubId}/recruitments/new?cloneFrom=${recruitment.id}`)}
                className="btn btn-ghost btn-sm flex-1"
              >
                양식 복제
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
