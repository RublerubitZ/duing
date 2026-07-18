'use client';

// 검색형 콤보박스 공용 컴포넌트 — Popover 프리미티브 위에서 인라인 검색 입력 + 키보드 네비 + 결과 listbox 를 제공한다.
// 검색 쿼리(훅·디바운스)는 호출부가 소유하고, 결과/로딩/렌더만 props 로 받는다.

import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/app/_lib/cn';
import { Spinner } from '@/components/loading/Spinner';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

type SearchComboboxProps<T> = {
  query: string;
  onQueryChange: (query: string) => void;
  /** 디바운스된 검색어가 비어있지 않은지 — 드롭다운 노출 조건 */
  hasQuery: boolean;
  isLoading: boolean;
  isFetching: boolean;
  results: T[];
  getKey: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  placeholder: string;
};

export function SearchCombobox<T>({
  query,
  onQueryChange,
  hasQuery,
  isLoading,
  isFetching,
  results,
  getKey,
  renderItem,
  onSelect,
  placeholder,
}: SearchComboboxProps<T>) {
  const listId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  // 새 검색 결과가 도착하면 하이라이트를 초기화한다 (이전 인덱스가 새 결과 범위를 벗어나는 것 방지).
  useEffect(() => {
    setHighlighted(-1);
  }, [results]);

  const showDropdown = open && hasQuery && !isLoading;

  const pick = (item: T) => {
    onSelect(item);
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
      const candidate = highlighted >= 0 && highlighted < results.length ? results[highlighted] : undefined;
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
            aria-activedescendant={showDropdown && highlighted >= 0 ? `${listId}-opt-${highlighted}` : undefined}
            autoComplete="off"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setHighlighted(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {isFetching && hasQuery && (
            <div role="status" aria-label="검색 중" className="delayed-show mt-1">
              <Spinner size={14} className="text-charcoal-3" />
            </div>
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
          results.map((item, index) => (
            <button
              key={getKey(item)}
              id={`${listId}-opt-${index}`}
              type="button"
              role="option"
              aria-selected={highlighted === index}
              onClick={() => pick(item)}
              onMouseEnter={() => setHighlighted(index)}
              className={cn(
                'block w-full rounded-sm px-3 py-2 text-left transition-colors',
                highlighted === index ? 'bg-sage-tint' : 'hover:bg-sage-tint',
              )}
            >
              {renderItem(item)}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

type ComboboxSelectedValueProps = {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  onClear: () => void;
  clearLabel?: string;
};

/** 콤보박스에서 값이 선택된 상태를 표시하는 칩 — primary/secondary + 초기화 버튼. */
export function ComboboxSelectedValue({
  primary,
  secondary,
  onClear,
  clearLabel = '변경',
}: ComboboxSelectedValueProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line bg-paper px-3 py-2">
      <div className="text-sm">
        <span className="font-medium text-charcoal">{primary}</span>
        {secondary && <span className="ml-2 text-xs text-charcoal-3">{secondary}</span>}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="rounded-sm px-2 py-1 text-xs text-charcoal-3 transition-colors hover:bg-graysoft hover:text-ink"
      >
        {clearLabel}
      </button>
    </div>
  );
}
