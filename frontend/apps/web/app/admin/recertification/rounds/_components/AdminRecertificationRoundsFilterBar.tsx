'use client';

import type { RoundStatus } from '@duing/types';
import { ROUND_STATUS_LABEL } from '../_lib/recertificationRoundLabels';

type Props = {
  status: RoundStatus | 'ALL';
  onStatusChange: (next: RoundStatus | 'ALL') => void;
};

const STATUS_OPTIONS: (RoundStatus | 'ALL')[] = ['ALL', 'OPEN', 'CLOSED'];

function isStatusOption(value: string): value is RoundStatus | 'ALL' {
  return ['ALL', 'OPEN', 'CLOSED'].includes(value);
}

export function AdminRecertificationRoundsFilterBar({ status, onStatusChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={status}
        onChange={(event) => {
          const next = event.target.value;
          if (isStatusOption(next)) onStatusChange(next);
        }}
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'ALL' ? '전체 상태' : ROUND_STATUS_LABEL[opt]}
          </option>
        ))}
      </select>
    </div>
  );
}
