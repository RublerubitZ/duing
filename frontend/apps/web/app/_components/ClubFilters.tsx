'use client';

import type { ClubCategory, ClubSearchParams } from '@duing/types';
import { cn } from '../_lib/cn';

const CATEGORIES: { value: ClubCategory; label: string }[] = [
  { value: 'ACADEMIC', label: '학술' },
  { value: 'CULTURE', label: '문화' },
  { value: 'ART', label: '예술' },
  { value: 'SPORTS', label: '체육' },
  { value: 'VOLUNTEER', label: '봉사' },
  { value: 'RELIGION', label: '종교' },
  { value: 'HOBBY', label: '취미' },
  { value: 'OTHER', label: '기타' },
];

type Props = {
  value: ClubSearchParams;
  onChange(next: ClubSearchParams): void;
};

export function ClubFilters({ value, onChange }: Props) {
  function toggleCategory(category: ClubCategory) {
    onChange({ ...value, category: value.category === category ? undefined : category });
  }
  function toggleRecruiting() {
    onChange({ ...value, recruiting: value.recruiting ? undefined : true });
  }
  function updateKeyword(keyword: string) {
    onChange({ ...value, keyword: keyword || undefined });
  }

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="동아리 이름·소개 검색"
        value={value.keyword ?? ''}
        onChange={(event) => updateKeyword(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2"
      />
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => {
          const active = value.category === category.value;
          return (
            <button
              key={category.value}
              type="button"
              onClick={() => toggleCategory(category.value)}
              className={cn(
                'rounded-full px-3 py-1 text-sm border',
                active
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'border-slate-300 text-slate-600 hover:border-slate-500',
              )}
            >
              {category.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={toggleRecruiting}
          className={cn(
            'rounded-full px-3 py-1 text-sm border',
            value.recruiting
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'border-slate-300 text-slate-600 hover:border-slate-500',
          )}
        >
          모집중만
        </button>
      </div>
    </div>
  );
}
