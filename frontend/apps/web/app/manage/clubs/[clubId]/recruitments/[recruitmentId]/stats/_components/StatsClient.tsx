'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  useRecruitmentStatsSummaryQuery,
  useRecruitmentStatsDailyQuery,
  useRecruitmentStatsFunnelQuery,
  useRecruitmentDetailQuery,
} from '@duing/hooks';
import { toRoute } from '../../../../../../../_lib/route';
import { SummaryCards } from './SummaryCards';
import { DailyLineChart } from './DailyLineChart';
import { FunnelChart } from './FunnelChart';

type StatsClientProps = {
  params: Promise<{ clubId: string; recruitmentId: string }>;
};

export function StatsClient({ params }: StatsClientProps) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);

  const safeRecruitmentId = isNaN(recruitmentId) ? undefined : recruitmentId;

  const {
    data: recruitment,
    isLoading: isRecruitmentLoading,
  } = useRecruitmentDetailQuery(safeRecruitmentId);

  const {
    data: statsSummary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
  } = useRecruitmentStatsSummaryQuery(safeRecruitmentId);

  const {
    data: dailyPoints,
    isLoading: isDailyLoading,
    isError: isDailyError,
  } = useRecruitmentStatsDailyQuery(safeRecruitmentId);

  const {
    data: funnelData,
    isLoading: isFunnelLoading,
    isError: isFunnelError,
  } = useRecruitmentStatsFunnelQuery(safeRecruitmentId);

  const recruitmentTitle = recruitment?.title ?? '모집';
  const isHeaderLoading = isRecruitmentLoading && !recruitment;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* 헤더 */}
      <div className="mb-8 flex flex-col gap-1">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 모집 상세로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-slate-900">
          {isHeaderLoading ? '불러오는 중…' : `통계 — ${recruitmentTitle}`}
        </h1>
      </div>

      {/* Summary 카드 */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">지원 현황</h2>
        {isSummaryLoading && (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        )}
        {isSummaryError && (
          <p className="text-sm text-rose-500">지원 현황 데이터를 불러올 수 없습니다.</p>
        )}
        {statsSummary && (
          <SummaryCards statsSummary={statsSummary} />
        )}
      </section>

      {/* 일자별 라인 차트 */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">일자별 지원 추이</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {isDailyLoading && (
            <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>
          )}
          {isDailyError && (
            <p className="py-6 text-center text-sm text-rose-500">
              일자별 데이터를 불러올 수 없습니다.
            </p>
          )}
          {dailyPoints && (
            <DailyLineChart dailyPoints={dailyPoints} />
          )}
        </div>
      </section>

      {/* Funnel 차트 */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">전형 단계별 현황</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {isFunnelLoading && (
            <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>
          )}
          {isFunnelError && (
            <p className="py-6 text-center text-sm text-rose-500">
              전형 데이터를 불러올 수 없습니다.
            </p>
          )}
          {funnelData && (
            <FunnelChart funnelData={funnelData} />
          )}
        </div>
      </section>
    </div>
  );
}