'use client';

import type { StatsSummary } from '@duing/types';

type SummaryCardsProps = {
  statsSummary: StatsSummary;
};

type CardDefinition = {
  label: string;
  value: number;
  subLabel?: string;
};

export function SummaryCards({ statsSummary }: SummaryCardsProps) {
  const acceptanceRatio = statsSummary.capacity > 0
    ? `합격률 ${(statsSummary.ratio * 100).toFixed(1)}% / 정원 ${statsSummary.capacity}`
    : undefined;

  const cards: CardDefinition[] = [
    { label: '전체', value: statsSummary.total },
    { label: '보류', value: statsSummary.onHold },
    { label: '면접대기', value: statsSummary.interviewPending },
    { label: '합격', value: statsSummary.accepted, subLabel: acceptanceRatio },
    { label: '불합격', value: statsSummary.rejected },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <p className="text-xs font-medium text-slate-500">{card.label}</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{card.value}</p>
          {card.subLabel && (
            <p className="mt-1 text-xs text-slate-400">{card.subLabel}</p>
          )}
        </div>
      ))}
    </div>
  );
}