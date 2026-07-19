'use client';

import type { SubmissionSummaryCounts } from '@duing/types';

export type SummaryFilter = 'ALL' | 'APPROVED' | 'NEED' | 'SUBMITTED' | 'CONFIRMED';

type Props = {
  counts: SubmissionSummaryCounts;
  activeFilter: SummaryFilter;
  onSelectFilter: (filter: SummaryFilter) => void;
};

/** Summary 4카드(스펙 v2 §7.1) — 운영자가 월간 현황을 숫자로 먼저 파악. 클릭=필터 토글(재클릭 시 전체). */
export function SubmissionSummaryCards({ counts, activeFilter, onSelectFilter }: Props) {
  const cards: { filter: Exclude<SummaryFilter, 'ALL'>; label: string; value: number; sub: string }[] = [
    { filter: 'APPROVED', label: '승인 완료', value: counts.approvedCount, sub: '제출 여부 무관 APPROVED' },
    { filter: 'NEED', label: '제출 필요', value: counts.awaitingCount, sub: '승인 완료 · Batch 미포함' },
    { filter: 'SUBMITTED', label: '제출함', value: counts.submittedCount, sub: '활성 Batch 포함' },
    { filter: 'CONFIRMED', label: '학교 등록 완료', value: counts.confirmedCount, sub: '학교 시스템 등록됨' },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <li key={card.filter}>
          <button
            type="button"
            aria-pressed={activeFilter === card.filter}
            onClick={() => onSelectFilter(activeFilter === card.filter ? 'ALL' : card.filter)}
            className={`w-full rounded-xl border p-4 text-left motion-safe:transition-colors ${
              activeFilter === card.filter ? 'border-ink bg-ink/5' : 'border-line bg-paper hover:border-sage'
            }`}
          >
            <p className="text-sm text-charcoal-3">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink-deep">{card.value}</p>
            <p className="mt-0.5 text-xs text-charcoal-3">{card.sub}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
