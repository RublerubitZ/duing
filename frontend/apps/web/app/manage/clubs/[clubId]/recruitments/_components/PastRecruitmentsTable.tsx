'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import type { RecruitmentSummary, StatsSummary } from '@duing/types';
import { countUndecided, statsQueryKeys, useApiClient } from '@duing/hooks';
import { APPLICATION_UNDECIDED_LABEL } from '@/app/_constants/application-status';
import { toRoute } from '@/app/_lib/route';
import { recruitmentPeriodLabel, recruitmentStatusChip } from '@/app/_lib/recruitmentDisplay';
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
  // 외부 폼은 지원 데이터가 없어 자체 폼 행만 조회한다 — combine 도 같은 배열로 인덱싱해야 수치가 제 행에 붙는다.
  // 외부 폼 행은 Map 에 없어 "—" 가 된다(다른 화면이 같은 키를 0 으로 채워도 이 표는 그 키를 구독하지 않는다).
  const selfRecruitments = recruitments.filter((recruitment) => recruitment.applicationMode === 'SELF');
  const summariesById = useQueries({
    queries: selfRecruitments.map((recruitment) => ({
      queryKey: statsQueryKeys.summary(recruitment.id),
      queryFn: () => client.stats.summary(recruitment.id),
    })),
    combine: (results) => {
      const byId = new Map<number, StatsSummary>();
      results.forEach((result, index) => {
        const recruitment = selfRecruitments[index];
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

  function undecidedCount(recruitmentId: number): number {
    const summary = summariesById.get(recruitmentId);
    return summary ? countUndecided(summary) : 0;
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
            {recruitments.map((recruitment) => {
              const statusChip = recruitmentStatusChip(recruitment);
              return (
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
                  <td className="px-4 py-3 tabular-nums text-charcoal">
                    {appliedAcceptedLabel(recruitment.id)}
                    {undecidedCount(recruitment.id) > 0 && (
                      <div className="mt-0.5 text-xs font-semibold text-coral-deep">
                        {APPLICATION_UNDECIDED_LABEL} {undecidedCount(recruitment.id)}명
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusChip.badgeClass}`}
                    >
                      {statusChip.label}
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
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 리스트 */}
      <div className="divide-y divide-line md:hidden">
        {recruitments.map((recruitment) => {
          const statusChip = recruitmentStatusChip(recruitment);
          return (
            <div key={recruitment.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
                  className="font-medium text-ink-deep hover:underline"
                >
                  {recruitment.title}
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusChip.badgeClass}`}
                >
                  {statusChip.label}
                </span>
              </div>
              <div className="mt-1 text-xs text-charcoal-3">
                {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
                {recruitmentClosedLabel(recruitment) !== null && ` · ${recruitmentClosedLabel(recruitment)}`} · 전형{' '}
                {recruitmentFlowLabel(recruitment.useInterview)}
              </div>
              <div className="mt-1 tabular-nums text-sm text-charcoal">
                지원 {appliedAcceptedLabel(recruitment.id)}
                {undecidedCount(recruitment.id) > 0 && (
                  <span className="font-semibold text-coral-deep"> · {APPLICATION_UNDECIDED_LABEL} {undecidedCount(recruitment.id)}명</span>
                )}
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
          );
        })}
      </div>
    </div>
  );
}
