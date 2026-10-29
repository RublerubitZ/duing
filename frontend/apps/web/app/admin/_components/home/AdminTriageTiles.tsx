'use client';

import Link from 'next/link';
import { useAdminPendingCountsQuery, useAdminTriageQueue } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { ADMIN_TRIAGE_TILES, triageTileHref, triageTileSubline } from './adminTriagePresentation';

export function AdminTriageTiles() {
  const { data: pendingCounts } = useAdminPendingCountsQuery();
  const queue = useAdminTriageQueue();
  const now = new Date();

  return (
    <section aria-label="영역별 대기">
      {/* 신고 칸이 2칸 폭이라 2열이면 1+3줄, 4열이면 2줄로 7칸이 외톨이 칸 없이 찬다. */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ADMIN_TRIAGE_TILES.map((tile) => {
          const count = pendingCounts?.[tile.countKey];
          // 0건에 경고색을 칠하면 경고가 배경이 된다 — 위험 칸도 건수가 있을 때만.
          const isAlert = tile.isDanger && (count ?? 0) > 0;
          const subline = triageTileSubline(count, tile.key === 'CLUB_APPROVAL' ? null : queue.areas[tile.key], now);
          return (
            <li key={tile.key} className={cn(tile.isDanger && 'col-span-2')}>
              <Link
                href={toRoute(triageTileHref(tile.key, queue.inquiryTotals))}
                className={cn(
                  'flex h-full min-h-11 flex-col gap-1 rounded-xl border bg-paper p-3 transition hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
                  isAlert ? 'border-coral/40' : 'border-line',
                )}
              >
                <span className={cn('break-keep text-xs font-semibold', isAlert ? 'text-coral-deep' : 'text-charcoal-2')}>
                  {tile.label}
                </span>
                <span className="min-h-7 text-xl font-bold tabular-nums text-ink">{count === undefined ? null : `${count}건`}</span>
                <span className="min-h-4 break-keep text-xs text-charcoal-3">{subline}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
