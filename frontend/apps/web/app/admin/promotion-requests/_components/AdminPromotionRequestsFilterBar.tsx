'use client';

import type { PromotionRequestStatus } from '@duing/types';
import { PROMOTION_REQUEST_STATUS_LABEL } from '../_lib/promotionRequestLabels';

type Props = {
  status: PromotionRequestStatus | 'ALL';
  clubIdInput: string;
  onStatusChange: (next: PromotionRequestStatus | 'ALL') => void;
  onClubIdInputChange: (next: string) => void;
};

const STATUS_OPTIONS: (PromotionRequestStatus | 'ALL')[] = [
  'ALL',
  'PENDING',
  'ACCEPTED',
  'REJECTED',
];

function isStatusOption(value: string): value is PromotionRequestStatus | 'ALL' {
  return ['ALL', 'PENDING', 'ACCEPTED', 'REJECTED'].includes(value);
}

export function AdminPromotionRequestsFilterBar({
  status,
  clubIdInput,
  onStatusChange,
  onClubIdInputChange,
}: Props) {
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
            {opt === 'ALL' ? '전체 상태' : PROMOTION_REQUEST_STATUS_LABEL[opt]}
          </option>
        ))}
      </select>

      <input
        type="number"
        value={clubIdInput}
        onChange={(event) => onClubIdInputChange(event.target.value)}
        placeholder="동아리 ID 입력"
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px] w-40"
        min={1}
      />
    </div>
  );
}
