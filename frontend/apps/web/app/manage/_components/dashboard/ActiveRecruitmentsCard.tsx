'use client';

import Link from 'next/link';
import { useActiveRecruitments } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';
import { DDayBadge } from '@/app/manage/_components/DDayBadge';
import { recruitmentStatusChip } from '@/app/_lib/recruitmentDisplay';

export function ActiveRecruitmentsCard({ clubId }: { clubId: number }) {
  const { data, isLoading } = useActiveRecruitments(clubId);
  const recruitments = data ?? [];
  const now = new Date();

  return (
    <DashboardCard
      title="진행 중 모집"
      badge={recruitments.length > 0 ? <span className="text-xs text-charcoal-3">{recruitments.length}건</span> : undefined}
      isLoading={isLoading}
      isEmpty={!isLoading && recruitments.length === 0}
      emptyText="진행 중인 모집이 없어요"
    >
      <ul className="flex flex-col gap-2">
        {recruitments.map((recruitment) => {
          // 마감일만 지난 모집도 여기 남는다(심사 진행 중) — 칩 헬퍼가 '마감' 대신 기간 종료로 구분한다.
          const statusChip = recruitmentStatusChip(recruitment);
          return (
            <li key={recruitment.id}>
              <Link
                href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
                className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition hover:bg-sage-tint"
              >
                <span className="truncate font-medium text-charcoal">{recruitment.title}</span>
                <span className="ml-3 flex shrink-0 items-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusChip.badgeClass}`}>
                    {statusChip.label}
                  </span>
                  <DDayBadge recruitment={recruitment} now={now} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}
