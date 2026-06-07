'use client';

import { useState } from 'react';
import { useClubListQuery } from '@duing/hooks';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';

type Props = {
  selectedClubId: number | null;
  selectedClubName: string | null;
  onSelect: (clubId: number, clubName: string) => void;
  onClear: () => void;
};

const RESULT_PAGE_SIZE = 8;

export function ClubSelector({ selectedClubId, selectedClubName, onSelect, onClear }: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const searchQuery = useClubListQuery({
    keyword: debouncedQuery,
    page: 0,
    size: RESULT_PAGE_SIZE,
  });

  if (selectedClubId !== null) {
    return (
      <div className="border-line flex items-center justify-between rounded-md border bg-white px-3 py-2">
        <div className="text-sm">
          <span className="font-medium text-slate-900">{selectedClubName ?? `#${selectedClubId}`}</span>
          <span className="text-charcoal-3 ml-2 text-xs">ID {selectedClubId}</span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-charcoal-3 rounded px-2 py-1 text-xs hover:bg-slate-100"
        >
          변경
        </button>
      </div>
    );
  }

  const showDropdown = focused && debouncedQuery.length > 0 && !searchQuery.isLoading;
  const results = searchQuery.data?.content ?? [];

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        // blur 가 click 보다 먼저 실행되면 dropdown 이 사라져 선택이 안 되므로 delay.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="동아리명으로 검색"
        className="border-line bg-paper w-full rounded-md border px-3 py-2 text-sm"
        autoComplete="off"
      />

      {searchQuery.isFetching && debouncedQuery.length > 0 && (
        <p className="text-charcoal-3 mt-1 text-xs">검색 중…</p>
      )}

      {showDropdown && (
        <div className="border-line absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-md border bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="text-charcoal-3 px-3 py-3 text-sm">검색 결과가 없습니다.</p>
          ) : (
            <ul role="listbox">
              {results.map((club) => (
                <li key={club.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(event) => {
                      // blur 보다 먼저 실행되어 dropdown 이 닫히기 전에 선택을 확정한다.
                      event.preventDefault();
                      onSelect(club.id, club.name);
                      setQuery('');
                      setFocused(false);
                    }}
                    className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="text-sm font-medium text-slate-900">{club.name}</div>
                    <div className="text-charcoal-3 text-xs">
                      {club.division ?? '분과 미지정'} · ID {club.id}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
