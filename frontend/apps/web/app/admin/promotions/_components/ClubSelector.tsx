'use client';

import { useState } from 'react';

import { useClubListQuery } from '@duing/hooks';

import { SearchCombobox, ComboboxSelectedValue } from '@/components/SearchCombobox';
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
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const searchQuery = useClubListQuery({ keyword: debouncedQuery, page: 0, size: RESULT_PAGE_SIZE });

  if (selectedClubId !== null) {
    return (
      <ComboboxSelectedValue
        primary={selectedClubName ?? `#${selectedClubId}`}
        secondary={`ID ${selectedClubId}`}
        onClear={onClear}
      />
    );
  }

  return (
    <SearchCombobox
      query={query}
      onQueryChange={setQuery}
      hasQuery={debouncedQuery.length > 0}
      isLoading={searchQuery.isLoading}
      isFetching={searchQuery.isFetching}
      results={searchQuery.data?.content ?? []}
      getKey={(club) => club.id}
      onSelect={(club) => {
        onSelect(club.id, club.name);
        setQuery('');
      }}
      renderItem={(club) => (
        <>
          <div className="text-sm font-medium text-charcoal">{club.name}</div>
          <div className="text-xs text-charcoal-3">
            {club.division ?? '분과 미지정'} · ID {club.id}
          </div>
        </>
      )}
      placeholder="동아리명으로 검색"
    />
  );
}
