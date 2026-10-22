'use client';

import Link from 'next/link';
import { useApplicantSummary } from '@duing/hooks';
import { APPLICATION_STATUS_OPERATOR_LABEL } from '@/app/_constants/application-status';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';

export function ApplicantSummaryCard({ clubId }: { clubId: number }) {
  const { totals, isLoading, isError } = useApplicantSummary(clubId);

  const statCards: Array<{ label: string; value: number }> = [
    { label: APPLICATION_STATUS_OPERATOR_LABEL.SUBMITTED, value: totals.submitted },
    { label: APPLICATION_STATUS_OPERATOR_LABEL.ON_HOLD, value: totals.onHold },
    { label: APPLICATION_STATUS_OPERATOR_LABEL.INTERVIEW_PENDING, value: totals.interviewPending },
    { label: APPLICATION_STATUS_OPERATOR_LABEL.ACCEPTED, value: totals.accepted },
    { label: APPLICATION_STATUS_OPERATOR_LABEL.REJECTED, value: totals.rejected },
  ];

  return (
    <DashboardCard
      title="지원자 현황"
      badge={<span className="text-xs text-charcoal-3">총 {totals.total}명</span>}
      isLoading={isLoading}
      isError={isError}
      isEmpty={!isLoading && totals.total === 0}
      emptyText="집계할 지원자 데이터가 없어요"
      footer={
        <Link href={toRoute(`/manage/clubs/${clubId}/recruitments`)} className="text-xs font-medium text-ink hover:underline">
          모집별 통계 보기 →
        </Link>
      }
    >
      {/* md 부터 사이드바(280px)와 대시보드 2열이 겹쳐 카드가 좁다 — 5열이면 4글자 라벨이 접혀 xl 부터 다시 5열(md 초입 768 근처는 3열이어도 두 줄) */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-3 xl:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-md border border-line bg-paper p-2 text-center">
            <p className="text-xs text-charcoal-3">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-charcoal">{card.value}</p>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
