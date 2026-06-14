'use client';

import { useState } from 'react';

import { useAdminUserSearchQuery } from '@duing/hooks';
import type { AdminUserSearchResult } from '@duing/types';

import { SearchCombobox, ComboboxSelectedValue } from '@/components/SearchCombobox';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';

type Props = {
  selectedLeader: AdminUserSearchResult | null;
  onSelect: (leader: AdminUserSearchResult | null) => void;
};

const RESULT_PAGE_SIZE = 8;

export function LeaderSearchCombobox({ selectedLeader, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const searchQuery = useAdminUserSearchQuery({ q: debouncedQuery, page: 0, size: RESULT_PAGE_SIZE });

  if (selectedLeader) {
    return (
      <ComboboxSelectedValue
        primary={selectedLeader.name}
        secondary={`${selectedLeader.studentId} · ${selectedLeader.email}`}
        onClear={() => onSelect(null)}
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
      getKey={(user) => user.id}
      onSelect={(user) => {
        onSelect(user);
        setQuery('');
      }}
      renderItem={(user) => (
        <>
          <div className="text-sm font-medium text-charcoal">{user.name}</div>
          <div className="text-xs text-charcoal-3">
            {user.studentId} · {user.email}
          </div>
        </>
      )}
      placeholder="학번 / 이름 / 이메일로 회장 검색"
    />
  );
}
