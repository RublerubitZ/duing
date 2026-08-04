import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useHydrated } from '@/app/_lib/useHydrated';

describe('useHydrated', () => {
  // jsdom 은 SSR 프레임(서버 스냅샷 false)을 재현하지 못한다 — 여기서는 "하이드레이션 후 true"
  // 만 고정하고, SSR HTML 에 부정 UI 가 실리지 않는지는 Task 11 의 실브라우저 E2E 소관.
  it('클라이언트 렌더에서는 true 를 반환한다', () => {
    const { result } = renderHook(() => useHydrated());
    expect(result.current).toBe(true);
  });
});
