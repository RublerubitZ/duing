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
      {cards.map((card) => {
        const isActive = activeTab === card.tab;
        return (
          <li key={card.tab}>
            {/* 목업 CKpis/CandidateCards — 활성 카드는 ink-deep 채움 + sage 라벨. */}
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectTab(card.tab)}
              className={`w-full rounded-[14px] border px-4 py-3.5 text-left motion-safe:transition-colors ${
                isActive ? 'border-ink-deep bg-ink-deep' : 'border-line bg-paper hover:border-sage'
              }`}
            >
              <p className={`text-xs font-semibold ${isActive ? 'text-sage' : 'text-charcoal-3'}`}>{card.label}</p>
              <p
                className={`mt-1.5 font-display text-[26px] font-bold leading-none tabular-nums ${
                  card.warn ? 'text-coral' : isActive ? 'text-paper' : 'text-ink-deep'
                }`}
              >
                {card.value}
              </p>
              <p
                className={`mt-1.5 text-[11.5px] ${
                  card.warn ? 'text-coral' : isActive ? 'text-paper/60' : 'text-charcoal-3'
                }`}
              >
                {card.sub}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
