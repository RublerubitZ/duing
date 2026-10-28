'use client';

import { kstDateTimeFormatter, useDashboardTaskQueue } from '@duing/hooks';
import { useHydrated } from '@/app/_lib/useHydrated';

const HEADLINE_DATE_FORMATTER = kstDateTimeFormatter({ month: 'long', day: 'numeric', weekday: 'long' });

export function DashboardHeadline({ clubId }: { clubId: number }) {
  const isHydrated = useHydrated();
  const { totalCount, isLoading, isError } = useDashboardTaskQueue(clubId);

  // 하이드레이션 전에는 줄 전체를 비우고 높이만 예약한다 — 서버 HTML 의 "오늘"이 보는 날과 달라 #418 이 나지 않게.
  if (!isHydrated) return <p className="mt-1 min-h-5 text-sm text-charcoal-2" />;

  // 로딩 중이거나 일부 실패면 과소 집계가 사실처럼 보이지 않게 건수(와 구분자)를 뺀다.
  const countText = isLoading || isError ? null : totalCount > 0 ? `처리할 업무 ${totalCount}건` : '처리할 업무 없음';
  return (
    <p className="mt-1 min-h-5 text-sm text-charcoal-2">
      {HEADLINE_DATE_FORMATTER.format(new Date())}
      {countText ? ` · ${countText}` : null}
    </p>
  );
}
