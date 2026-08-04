import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthStore } from '@duing/stores';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';

beforeEach(() => useAuthStore.setState(useAuthStore.getInitialState(), true));

describe('useSeededAuthStatus', () => {
  it('클라이언트에서는 스토어 현재값을 따른다', () => {
    const { result } = renderHook(() => useSeededAuthStatus(null));
    expect(result.current).toBe('unauthenticated');
    act(() => useAuthStore.getState().seedSession('authenticated'));
    expect(result.current).toBe('authenticated');
  });

  it('serverSeed 는 SSR 스냅샷이다 — 클라 렌더 결과에는 스토어가 우선한다', () => {
    // jsdom 은 하이드레이션 프레임을 재현하지 못하므로, 여기서는 "클라 값이 스토어"임을 고정하고
    // SSR HTML 일치는 Task 11 의 실브라우저 E2E(하이드레이션 오류 0)로 검증한다.
    const { result } = renderHook(() => useSeededAuthStatus(true));
    expect(result.current).toBe('unauthenticated'); // 스토어 미시드 상태
  });
});
