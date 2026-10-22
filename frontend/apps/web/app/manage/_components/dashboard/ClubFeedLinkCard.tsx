'use client';

import Link from 'next/link';
import { useClubFeedCounts } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';

export function ClubFeedLinkCard({ clubId }: { clubId: number }) {
  const { noticeCount, eventCount, isLoading, isError } = useClubFeedCounts(clubId);
  const isEmpty = noticeCount === 0 && eventCount === 0;

  return (
    <DashboardCard
      title="공지 · 일정"
      isLoading={isLoading}
      isError={isError}
      // 정상 빈 상태는 아래 children 문구와 바로가기로 보이고, 두 조회가 실패해 0 이 된 경우만 카드의 오류 안내로 보낸다
      isEmpty={isError && isEmpty}
      footer={
        <Link href={toRoute(`/clubs/${clubId}`)} className="text-xs font-medium text-ink hover:underline">
          동아리 페이지 바로가기 →
        </Link>
      }
    >
      {isEmpty ? (
        <p className="text-sm text-charcoal-3">아직 공지·일정이 없어요</p>
      ) : (
        <p className="text-sm text-charcoal">
          공지 <span className="font-semibold">{noticeCount}</span> · 일정 <span className="font-semibold">{eventCount}</span>
        </p>
      )}
    </DashboardCard>
  );
}
