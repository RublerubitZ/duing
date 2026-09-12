'use client';

import type { NoticeCategory } from '@duing/types';
import { NOTICE_CATEGORY_OPTIONS } from '../_lib/categoryLabels';

type Props = {
  selectedCategory: NoticeCategory | 'ALL';
  keyword: string;
  onCategoryChange: (next: NoticeCategory | 'ALL') => void;
  onKeywordChange: (next: string) => void;
  onKeywordSubmit: () => void;
};

export function NoticeFilterBar({
  selectedCategory, keyword,
  onCategoryChange, onKeywordChange, onKeywordSubmit,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {NOTICE_CATEGORY_OPTIONS.map((option) => {
          const active = option.value === selectedCategory;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onCategoryChange(option.value)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                active
                  ? 'bg-ink text-paper'
                  : 'bg-paper border border-line text-charcoal-2 hover:border-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onKeywordSubmit();
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="제목/요약 검색"
          className="flex-1 px-3.5 py-2 rounded-full bg-paper border border-line text-[13.5px]"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
        >
          검색
        </button>
      </form>
    </div>
  );
}
