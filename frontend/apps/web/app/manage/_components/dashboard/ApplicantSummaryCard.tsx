'use client';

import Link from 'next/link';
import { useApplicantSummary } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';

export function ApplicantSummaryCard({ clubId }: { clubId: number }) {
  const { totals, isLoading } = useApplicantSummary(clubId);

  const statCards: Array<{ label: string; value: number }> = [
    { label: '접수', value: totals.submitted },
    { label: '보류', value: totals.onHold },
    { label: '면접대기', value: totals.interviewPending },
    { label: '합격', value: totals.accepted },
    { label: '불합격', value: totals.rejected },
  ];

  return (
    <DashboardCard
      title="지원자 현황"
      badge={<span className="text-xs text-charcoal-3">총 {totals.total}명</span>}
      isLoading={isLoading}
      isEmpty={!isLoading && totals.total === 0}
      emptyText="집계할 지원자 데이터가 없어요"
      footer={
        <Link href={toRoute(`/manage/clubs/${clubId}/recruitments`)} className="text-xs font-medium text-ink hover:underline">
          모집별 통계 보기 →
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
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
