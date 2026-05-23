'use client';

import { type ChangeEvent } from 'react';
import type { SuccessionStatus } from '@duing/types';
import { SUCCESSION_STATUS_LABEL } from '../_lib/successionLabels';

type Props = {
  status: SuccessionStatus | 'ALL';
  clubIdInput: string;
  onStatusChange: (next: SuccessionStatus | 'ALL') => void;
  onClubIdInputChange: (next: string) => void;
};

const STATUS_OPTIONS: (SuccessionStatus | 'ALL')[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

function isStatusOption(value: string): value is SuccessionStatus | 'ALL' {
  return ['ALL', 'PENDING', 'APPROVED', 'REJECTED'].includes(value);
}

export function AdminSuccessionFilterBar({ status, clubIdInput, onStatusChange, onClubIdInputChange }: Props) {
  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (isStatusOption(next)) onStatusChange(next);
  };

  const handleClubIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onClubIdInputChange(event.target.value);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={status}
        onChange={handleStatusChange}
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'ALL' ? '전체 상태' : SUCCESSION_STATUS_LABEL[opt]}
          </option>
        ))}
      </select>

      <input
        type="number"
        min="1"
        value={clubIdInput}
        onChange={handleClubIdChange}
        placeholder="동아리 ID (선택)"
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px] w-40"
      />
    </div>
  );
}
