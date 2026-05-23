'use client';

import { type ChangeEvent } from 'react';
import type { AdminRecertificationRound, RecertificationStatus } from '@duing/types';
import { RECERTIFICATION_STATUS_LABEL } from '../_lib/recertificationRequestLabels';

type Props = {
  status: RecertificationStatus | 'ALL';
  roundId: string;
  rounds: AdminRecertificationRound[];
  onStatusChange: (next: RecertificationStatus | 'ALL') => void;
  onRoundIdChange: (next: string) => void;
};

const STATUS_OPTIONS: (RecertificationStatus | 'ALL')[] = [
  'ALL',
  'PENDING',
  'APPROVED',
  'REJECTED',
];

function isStatusOption(value: string): value is RecertificationStatus | 'ALL' {
  return STATUS_OPTIONS.includes(value as RecertificationStatus | 'ALL');
}

export function AdminRecertificationRequestsFilterBar({
  status,
  roundId,
  rounds,
  onStatusChange,
  onRoundIdChange,
}: Props) {
  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (isStatusOption(next)) onStatusChange(next);
  };

  const handleRoundChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onRoundIdChange(event.target.value);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={roundId}
        onChange={handleRoundChange}
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
      >
        <option value="">전체 라운드</option>
        {rounds.map((round) => (
          <option key={round.id} value={String(round.id)}>
            {round.year}년 {round.label}
          </option>
        ))}
      </select>

      <select
        value={status}
        onChange={handleStatusChange}
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'ALL' ? '전체 상태' : RECERTIFICATION_STATUS_LABEL[opt]}
          </option>
        ))}
      </select>
    </div>
  );
}
