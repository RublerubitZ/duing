'use client';

import type { NoticeVisibility } from '@duing/types';
import { VISIBILITY_LABEL } from '../_lib/visibilityLabels';

type Props = {
  visibility: NoticeVisibility | 'ALL';
  keyword: string;
  includeExpired: boolean;
  onVisibilityChange: (next: NoticeVisibility | 'ALL') => void;
  onKeywordChange: (next: string) => void;
  onKeywordSubmit: () => void;
  onIncludeExpiredChange: (next: boolean) => void;
};

const OPTIONS: (NoticeVisibility | 'ALL')[] = ['ALL', 'PUBLIC', 'OFFICERS_ALL', 'CLUB_SCOPED'];

function isVisibilityOption(value: string): value is NoticeVisibility | 'ALL' {
  return value === 'ALL' || value === 'PUBLIC' || value === 'OFFICERS_ALL' || value === 'CLUB_SCOPED';
}

export function AdminNoticesFilterBar({
  visibility, keyword, includeExpired,
  onVisibilityChange, onKeywordChange, onKeywordSubmit, onIncludeExpiredChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={visibility}
        onChange={(event) => {
          const next = event.target.value;
          if (isVisibilityOption(next)) onVisibilityChange(next);
        }}
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
      >
        {OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'ALL' ? '전체 범위' : VISIBILITY_LABEL[opt]}
          </option>
        ))}
      </select>

      <form
        onSubmit={(event) => { event.preventDefault(); onKeywordSubmit(); }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="제목 검색"
          className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
        />
        <button type="submit" className="px-3 py-1.5 rounded-md bg-ink text-paper text-[13px] font-semibold">검색</button>
      </form>

      <label className="inline-flex items-center gap-1.5 text-[13px] text-charcoal-2">
        <input
          type="checkbox"
          checked={includeExpired}
          onChange={(event) => onIncludeExpiredChange(event.target.checked)}
        />
        만료 포함
      </label>
    </div>
  );
}
