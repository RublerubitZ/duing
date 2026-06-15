'use client';

import Link from 'next/link';
import type { TodayScheduleItem } from '@duing/types';
import { useTodaySchedule, parseKstInstant } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parseKstInstant(iso));
}

function ScheduleRow({ clubId, item }: { clubId: number; item: TodayScheduleItem }) {
  const label = (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs font-semibold text-charcoal-2">{formatTime(item.startAt)}</span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          item.kind === 'INTERVIEW' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
        }`}
      >
        {item.kind === 'INTERVIEW' ? '면접' : '행사'}
      </span>
      <span className="truncate text-sm text-charcoal">{item.title}</span>
    </div>
  );

  if (item.kind === 'INTERVIEW' && item.recruitmentId !== undefined && item.roundId !== undefined) {
    return (
      <Link
        href={toRoute(`/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview/rounds/${item.roundId}`)}
        className="block rounded-md px-2 py-2 transition hover:bg-sage-tint"
      >
        {label}
      </Link>
    );
  }
  return <div className="px-2 py-2">{label}</div>;
}

export function TodayScheduleCard({ clubId }: { clubId: number }) {
  const { items, isLoading } = useTodaySchedule(clubId);

  return (
    <DashboardCard
      title="오늘 일정"
      badge={items.length > 0 ? <span className="text-xs text-charcoal-3">{items.length}건</span> : undefined}
      isLoading={isLoading}
      isEmpty={!isLoading && items.length === 0}
      emptyText="오늘 일정이 없어요"
    >
      <ul className="flex flex-col gap-1">
        {items.map((item, index) => (
          <li key={`${item.kind}-${item.slotId ?? item.eventId ?? index}-${item.startAt}`}>
            <ScheduleRow clubId={clubId} item={item} />
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
