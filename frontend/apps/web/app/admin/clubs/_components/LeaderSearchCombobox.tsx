'use client';

import { useState } from 'react';

import { useAdminUserSearchQuery } from '@duing/hooks';
import type { AdminUserSearchResult } from '@duing/types';

import { SearchCombobox, ComboboxSelectedValue } from '@/components/SearchCombobox';
import { MemberIdentity, memberMetaParts } from '../../_components/MemberIdentity';
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
        secondary={memberMetaParts(selectedLeader).join(' · ')}
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
      renderItem={(user) => <MemberIdentity user={user} />}
      placeholder="학번 / 이름으로 회장 검색"
    />
  );
}
