'use client';

import type { AdminFacilityBookingCounts } from '@duing/types';
import { conflictCardCount } from '../_lib/adminBookingDisplay';

export type AdminQueueTab = 'PENDING' | 'APPROVED' | 'CONFLICT_ATTENTION' | 'CONFIRMED' | 'ALL';

type Props = {
  counts: AdminFacilityBookingCounts;
  activeTab: AdminQueueTab;
  onSelectTab: (tab: AdminQueueTab) => void;
};

export function BookingSummaryCards({ counts, activeTab, onSelectTab }: Props) {
  const conflictTotal = conflictCardCount(counts);
  const cards: { tab: AdminQueueTab; label: string; value: number; sub: string; warn: boolean }[] = [
    {
      tab: 'PENDING', label: '승인 대기', value: counts.pendingCount,
      sub: `오늘 접수 ${counts.todaySubmittedCount}건 · 최장 ${counts.oldestPendingWaitingDays}일 대기`,
      warn: false,
    },
    {
      tab: 'APPROVED', label: '학교 반영 대기', value: counts.approvedWaitingCount,
      sub: `최장 D+${counts.oldestApprovedWaitingDays}`,
      warn: counts.oldestApprovedWaitingDays >= 7,
    },
    {
      tab: 'CONFLICT_ATTENTION', label: '충돌·의심', value: conflictTotal,
      sub: `충돌 ${counts.conflictCount} · 의심 ${counts.conflictSuspectedCount}`,
      warn: conflictTotal > 0,
    },
    { tab: 'CONFIRMED', label: '이달 확정', value: counts.confirmedThisMonthCount, sub: '자동+수동 확정', warn: false },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <li key={card.tab}>
          <button
            type="button"
            aria-pressed={activeTab === card.tab}
            onClick={() => onSelectTab(card.tab)}
            className={`w-full rounded-xl border p-4 text-left motion-safe:transition-colors ${
              activeTab === card.tab ? 'border-ink bg-ink/5' : 'border-line bg-paper hover:border-sage'
            }`}
          >
            <p className="text-sm text-charcoal-3">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${card.warn ? 'text-coral' : 'text-ink-deep'}`}>
              {card.value}
            </p>
            <p className={`mt-0.5 text-xs ${card.warn ? 'text-coral' : 'text-charcoal-3'}`}>{card.sub}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
