'use client';

import { useEffect, useState } from 'react';

/**
 * value 가 delay ms 동안 안정될 때만 반영된다.
 * typeahead 입력에서 매 키스트로크마다 백엔드 호출이 나가는 것을 방지한다.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
