import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useOnlineStatus } from '@/app/_lib/useOnlineStatus';

function mockNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe('useOnlineStatus', () => {
  it('초기 스냅샷이 navigator.onLine을 실제로 읽는다', () => {
    // jsdom 기본값(true)과 동치인 mock 은 스냅샷을 안 읽는 구현도 통과시켜 판별력이 없다 —
    // 기본값과 다른 false 로 모킹해 실제로 navigator.onLine 을 읽는지 검증한다.
    mockNavigatorOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it('offline/online 이벤트에 반응한다', () => {
    mockNavigatorOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());

    mockNavigatorOnLine(false);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current).toBe(false);

    mockNavigatorOnLine(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current).toBe(true);
  });
});
