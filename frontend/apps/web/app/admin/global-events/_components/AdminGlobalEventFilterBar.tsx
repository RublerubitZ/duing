'use client';

import type { GlobalEventCategory } from '@duing/types';
import {
  GLOBAL_EVENT_CATEGORY_LABEL,
  GLOBAL_EVENT_CATEGORY_ORDER,
  isGlobalEventCategory,
} from '../_lib/categoryLabels';

type Props = {
  category: GlobalEventCategory | 'ALL';
  keyword: string;
  onCategoryChange: (next: GlobalEventCategory | 'ALL') => void;
  onKeywordChange: (next: string) => void;
  onKeywordSubmit: () => void;
};

export function AdminGlobalEventFilterBar({
  category,
  keyword,
  onCategoryChange,
  onKeywordChange,
  onKeywordSubmit,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 border border-line rounded-lg bg-paper">
      <select
        value={category}
        onChange={(changeEvent) => {
          const next = changeEvent.target.value;
          if (next === 'ALL') onCategoryChange('ALL');
          else if (isGlobalEventCategory(next)) onCategoryChange(next);
        }}
        className="px-3 py-2 rounded-md border border-line text-[13px]"
      >
        <option value="ALL">전체 카테고리</option>
        {GLOBAL_EVENT_CATEGORY_ORDER.map((categoryValue) => (
          <option key={categoryValue} value={categoryValue}>
            {GLOBAL_EVENT_CATEGORY_LABEL[categoryValue]}
          </option>
        ))}
      </select>

      <form
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          onKeywordSubmit();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={keyword}
          onChange={(changeEvent) => onKeywordChange(changeEvent.target.value)}
          placeholder="제목·설명 검색"
          className="px-3 py-2 rounded-md border border-line text-[13px] w-[220px]"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-md bg-ink text-paper text-[13px]"
        >
          검색
        </button>
      </form>
    </div>
  );
}
