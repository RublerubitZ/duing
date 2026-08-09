'use client';

import { useEffect, useState } from 'react';

type Props = {
  defaultValue: string;
  onCommit: (value: string) => void;
  debounceMs?: number;
};

export function ApplicantsSearchInput({
  defaultValue,
  onCommit,
  debounceMs = 300,
}: Props) {
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    setInputValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (inputValue === defaultValue) return;
    const timer = setTimeout(() => onCommit(inputValue.trim()), debounceMs);
    return () => clearTimeout(timer);
  }, [inputValue, defaultValue, onCommit, debounceMs]);

  return (
    <input
      type="search"
      placeholder="이름·학번·학과로 검색"
      value={inputValue}
      onChange={(event) => setInputValue(event.target.value)}
      className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-3 focus:border-sage focus:outline-none lg:max-w-xs"
      aria-label="지원자 검색"
    />
  );
}
