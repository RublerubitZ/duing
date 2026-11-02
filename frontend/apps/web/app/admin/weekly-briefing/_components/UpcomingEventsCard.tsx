'use client';

import Link from 'next/link';

import { useGlobalEventListQuery } from '@duing/hooks';

import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from '@/components/dashboard/DashboardCard';

import { EVENTS_EMPTY_TEXT, eventPeriodText, shortRangeText, upcomingEventsRange } from '../_lib/thisWeekPresentation';

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded text-xs font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

/** 다가오는 행사 — 오늘 ~ 다음 주 일요일, 기간이 겹치는(진행 중) 행사 포함(공개 행사 API 그대로). */
export function UpcomingEventsCard({ currentMonday, todayIso }: { currentMonday: string; todayIso: string }) {
  const range = upcomingEventsRange(todayIso, currentMonday);
  const eventsQuery = useGlobalEventListQuery({ from: range.from, to: range.to });
  const events = eventsQuery.data;
  return (
    <DashboardCard
      title="다가오는 행사"
      badge={<span className="text-xs text-charcoal-3">{shortRangeText(range.from, range.to)}</span>}
      isLoading={events === undefined && !eventsQuery.isError}
      isError={eventsQuery.isError}
      isEmpty={!events}
      footer={
        // 화면 이동 링크는 인쇄에서 뺀다(정보 확인 팝업 링크와 같은 원칙).
        <Link href={toRoute('/admin/global-events')} className={`no-print ${LINK_CLASS}`}>
          글로벌 이벤트에서 관리
        </Link>
      }
    >
      {events ? (
        events.length === 0 ? (
          <p className="text-sm text-charcoal-2">
            {EVENTS_EMPTY_TEXT}{' '}
            <Link href={toRoute('/admin/global-events/new')} className={`no-print ${LINK_CLASS}`}>
              행사 추가
            </Link>
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 break-keep font-medium text-ink">{event.title}</span>
                <span className="text-xs text-charcoal-2">{eventPeriodText(event.startAt, event.endAt)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </DashboardCard>
  );
}
