'use client';

import { useState } from 'react';

import { useAdminNoticeListQuery } from '@duing/hooks';

import { SearchCombobox, ComboboxSelectedValue } from '@/components/SearchCombobox';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';

type Props = {
  selectedNoticeId: number | null;
  selectedNoticeTitle: string | null;
  onSelect: (noticeId: number, noticeTitle: string) => void;
  onClear: () => void;
};

const RESULT_PAGE_SIZE = 8;

export function NoticeSelector({ selectedNoticeId, selectedNoticeTitle, onSelect, onClear }: Props) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const searchQuery = useAdminNoticeListQuery({
    visibility: 'PUBLIC',
    keyword: debouncedQuery,
    page: 0,
    size: RESULT_PAGE_SIZE,
  });

  if (selectedNoticeId !== null) {
    return (
      <ComboboxSelectedValue
        primary={selectedNoticeTitle ?? `#${selectedNoticeId}`}
        secondary={`ID ${selectedNoticeId}`}
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
      getKey={(notice) => notice.id}
      onSelect={(notice) => {
        onSelect(notice.id, notice.title);
        setQuery('');
      }}
      renderItem={(notice) => (
        <>
          <div className="text-sm font-medium text-charcoal">{notice.title}</div>
          <div className="text-xs text-charcoal-3">
            {notice.category} · ID {notice.id}
          </div>
        </>
      )}
      placeholder="공지 제목으로 검색 (PUBLIC 공지만)"
    />
  );
}
