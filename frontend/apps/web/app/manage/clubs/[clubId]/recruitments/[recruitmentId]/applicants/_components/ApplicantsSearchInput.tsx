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
      className="rounded border border-neutral-300 px-3 py-2 text-sm w-64"
      aria-label="지원자 검색"
    />
  );
}
