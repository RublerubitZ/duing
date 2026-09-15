import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useEnteredFromSkeleton } from '../../app/_lib/useEnteredFromSkeleton';

describe('useEnteredFromSkeleton — 마운트 시점의 로딩 여부를 고정한다', () => {
  it('로딩으로 마운트되면 데이터가 도착해 false 로 리렌더돼도 true 를 유지한다', () => {
    const { result, rerender } = renderHook(({ isLoading }) => useEnteredFromSkeleton(isLoading), {
      initialProps: { isLoading: true },
    });
    expect(result.current).toBe(true);

    rerender({ isLoading: false });
    expect(result.current).toBe(true);
  });

  it('캐시로 콘텐츠부터 마운트되면 이후 true 가 돼도 false 를 유지한다', () => {
    const { result, rerender } = renderHook(({ isLoading }) => useEnteredFromSkeleton(isLoading), {
      initialProps: { isLoading: false },
    });
    expect(result.current).toBe(false);

    rerender({ isLoading: true });
    expect(result.current).toBe(false);
  });
});
