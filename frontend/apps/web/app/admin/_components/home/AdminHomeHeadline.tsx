'use client';

import { kstDateTimeFormatter, useAdminPendingCountsQuery } from '@duing/hooks';
import { useHydrated } from '@/app/_lib/useHydrated';

const HEADLINE_DATE_FORMATTER = kstDateTimeFormatter({ month: 'long', day: 'numeric', weekday: 'long' });

export function AdminHomeHeadline() {
  const isHydrated = useHydrated();
  const { data: pendingCounts } = useAdminPendingCountsQuery();

  // 하이드레이션 전에는 줄 전체를 비우고 높이만 예약한다 — 서버 HTML 의 "오늘"이 보는 날과 달라 #418 이 나지 않게.
  if (!isHydrated) return <p className="mt-1 min-h-5 text-sm text-charcoal-2" />;

  // 건수를 받기 전·받지 못했으면 날짜만 — 사이드바 배지와 같은 기준(data 유무)이다.
  const countText =
    pendingCounts === undefined
      ? null
      : pendingCounts.totalPendingCount > 0
        ? `처리 대기 ${pendingCounts.totalPendingCount}건`
        : '처리 대기 없음';
  // 한글은 음절마다 줄이 갈릴 수 있어, 날짜·건수를 각각 묶어 `·` 양옆에서만 줄바꿈되게 한다.
  return (
    <p className="mt-1 min-h-5 text-sm text-charcoal-2">
      <span className="whitespace-nowrap">{HEADLINE_DATE_FORMATTER.format(new Date())}</span>
      {countText ? (
        <>
          {' · '}
          <span className="whitespace-nowrap">{countText}</span>
        </>
      ) : null}
    </p>
  );
}
