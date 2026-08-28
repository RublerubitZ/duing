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
    { filter: 'NEED', label: '미제출 예약', value: counts.awaitingCount, sub: '아직 제출 목록에 포함되지 않은 예약' },
    { filter: 'SUBMITTED', label: '제출 대기 예약', value: counts.submittedCount, sub: '제출 목록에 포함되어 학교 제출을 기다리는 예약' },
    { filter: 'CONFIRMED', label: '학교 등록 완료', value: counts.confirmedCount, sub: '학교 시스템에 등록된 예약' },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const isActive = activeFilter === card.filter;
        return (
          <li key={card.filter}>
            {/* 목업 CandidateCards — 활성 카드는 ink-deep 채움 + sage 라벨. */}
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectFilter(isActive ? 'ALL' : card.filter)}
              className={`w-full rounded-[14px] border px-4 py-3.5 text-left motion-safe:transition-colors ${
                isActive ? 'border-ink-deep bg-ink-deep' : 'border-line bg-paper hover:border-sage'
              }`}
            >
              <p className={`text-xs font-semibold ${isActive ? 'text-sage' : 'text-charcoal-3'}`}>{card.label}</p>
              <p
                className={`mt-1.5 text-[26px] font-bold leading-none tabular-nums ${
                  isActive ? 'text-paper' : 'text-ink-deep'
                }`}
              >
                {card.value}
              </p>
              <p className={`mt-1.5 text-[11.5px] ${isActive ? 'text-paper/60' : 'text-charcoal-3'}`}>{card.sub}</p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
