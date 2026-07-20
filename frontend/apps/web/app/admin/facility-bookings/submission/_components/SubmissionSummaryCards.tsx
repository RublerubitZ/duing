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
    { filter: 'APPROVED', label: '승인 완료', value: counts.approvedCount, sub: '총동연 승인이 끝난 예약' },
    { filter: 'NEED', label: '학교에 제출할 예약', value: counts.awaitingCount, sub: '아직 제출 목록에 담기지 않았어요' },
    { filter: 'SUBMITTED', label: '제출 목록에 담김', value: counts.submittedCount, sub: '학교 제출을 준비 중인 예약' },
    { filter: 'CONFIRMED', label: '학교 등록 완료', value: counts.confirmedCount, sub: '학교 시스템에 등록된 예약' },
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
