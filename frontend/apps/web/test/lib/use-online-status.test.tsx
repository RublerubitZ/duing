import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useOnlineStatus } from '@/app/_lib/useOnlineStatus';

function mockNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe('useOnlineStatus', () => {
  it('navigator.onLine 초기값을 반환한다', () => {
    mockNavigatorOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
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
