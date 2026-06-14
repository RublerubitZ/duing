'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useAdminUserSearchQuery } from '@duing/hooks';
import type { AdminUserSearchResult } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';

type Props = {
  selectedLeader: AdminUserSearchResult | null;
  onSelect: (leader: AdminUserSearchResult | null) => void;
};

const RESULT_PAGE_SIZE = 8;

export function LeaderSearchCombobox({ selectedLeader, onSelect }: Props) {
  const listId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const searchQuery = useAdminUserSearchQuery({ q: debouncedQuery, page: 0, size: RESULT_PAGE_SIZE });

  // 새 검색 결과가 도착하면 하이라이트를 초기화한다 (이전 인덱스가 새 결과 범위를 벗어나는 것 방지).
  useEffect(() => {
    setHighlighted(-1);
  }, [searchQuery.data]);

  if (selectedLeader) {
    return (
      <div className="flex items-center justify-between rounded-md border border-line bg-paper px-3 py-2">
        <div className="text-sm">
          <span className="font-medium text-charcoal">{selectedLeader.name}</span>
          <span className="ml-2 text-xs text-charcoal-3">
            {selectedLeader.studentId} · {selectedLeader.email}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded-sm px-2 py-1 text-xs text-charcoal-3 transition-colors hover:bg-graysoft hover:text-ink"
        >
          변경
        </button>
      </div>
    );
  }

  const results = searchQuery.data?.content ?? [];
  const showDropdown = open && debouncedQuery.length > 0 && !searchQuery.isLoading;

  const pick = (leader: AdminUserSearchResult) => {
    onSelect(leader);
    setQuery('');
    setHighlighted(-1);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlighted((index) => (results.length === 0 ? -1 : (index + 1) % results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => (results.length === 0 ? -1 : index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      const candidate = highlighted >= 0 ? results[highlighted] : undefined;
      if (candidate) {
        event.preventDefault();
        pick(candidate);
      }
    }
    // Escape 는 Radix Popover(DismissableLayer)가 처리해 onOpenChange→setOpen(false) 로 닫는다.
  };

  return (
    <Popover open={showDropdown} onOpenChange={(next) => setOpen(next)}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative">
          <input
            type="search"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlighted >= 0 ? `${listId}-opt-${highlighted}` : undefined}
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlighted(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="학번 / 이름 / 이메일로 회장 검색"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {searchQuery.isFetching && debouncedQuery.length > 0 && (
            <p className="mt-1 text-xs text-charcoal-3">검색 중…</p>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        id={listId}
        role="listbox"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          // 입력(앵커) 클릭은 닫기 트리거에서 제외 — 입력은 콤보박스의 일부다.
          const target = event.target;
          if (target instanceof Node && anchorRef.current?.contains(target)) event.preventDefault();
        }}
        className="max-h-64 overflow-auto"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        {results.length === 0 ? (
          <p className="px-3 py-3 text-sm text-charcoal-3">검색 결과가 없습니다.</p>
        ) : (
          results.map((user, index) => (
            <button
              key={user.id}
              id={`${listId}-opt-${index}`}
              type="button"
              role="option"
              aria-selected={highlighted === index}
              onClick={() => pick(user)}
              onMouseEnter={() => setHighlighted(index)}
              className={cn(
                'block w-full rounded-sm px-3 py-2 text-left transition-colors',
                highlighted === index ? 'bg-sage-tint' : 'hover:bg-sage-tint',
              )}
            >
              <div className="text-sm font-medium text-charcoal">{user.name}</div>
              <div className="text-xs text-charcoal-3">
                {user.studentId} · {user.email}
              </div>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
