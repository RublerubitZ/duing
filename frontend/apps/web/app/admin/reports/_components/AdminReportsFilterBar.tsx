'use client';

import type { ReportStatus, ReportTargetType } from '@duing/types';
import { REPORT_STATUS_LABEL, REPORT_TARGET_TYPE_LABEL } from '../_lib/reportLabels';

type Props = {
  status: ReportStatus | 'ALL';
  targetType: ReportTargetType | 'ALL';
  onStatusChange: (next: ReportStatus | 'ALL') => void;
  onTargetTypeChange: (next: ReportTargetType | 'ALL') => void;
};

const STATUS_OPTIONS: (ReportStatus | 'ALL')[] = ['ALL', 'PENDING', 'RESOLVED', 'DISMISSED'];
const TARGET_TYPE_OPTIONS: (ReportTargetType | 'ALL')[] = ['ALL', 'CLUB', 'RECRUITMENT'];

function isStatusOption(value: string): value is ReportStatus | 'ALL' {
  return ['ALL', 'PENDING', 'RESOLVED', 'DISMISSED'].includes(value);
}

function isTargetTypeOption(value: string): value is ReportTargetType | 'ALL' {
  return ['ALL', 'CLUB', 'RECRUITMENT'].includes(value);
}

export function AdminReportsFilterBar({ status, targetType, onStatusChange, onTargetTypeChange }: Props) {
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
            {opt === 'ALL' ? '전체 상태' : REPORT_STATUS_LABEL[opt]}
          </option>
        ))}
      </select>

      <select
        value={targetType}
        onChange={(event) => {
          const next = event.target.value;
          if (isTargetTypeOption(next)) onTargetTypeChange(next);
        }}
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
      >
        {TARGET_TYPE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'ALL' ? '전체 대상' : REPORT_TARGET_TYPE_LABEL[opt]}
          </option>
        ))}
      </select>
    </div>
  );
}
