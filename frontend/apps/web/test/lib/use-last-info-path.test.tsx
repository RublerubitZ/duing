import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLastInfoPath } from '../../app/_lib/useLastInfoPath';

const STORAGE_KEY = 'duing:info-last-path';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useLastInfoPath', () => {
  it('기록이 없으면 기본 경로(/notices)를 반환한다', () => {
    const { result } = renderHook(() => useLastInfoPath('/clubs'));
    expect(result.current).toBe('/notices');
  });

  it('마운트 후 저장된 허브 경로로 교체된다', () => {
    window.localStorage.setItem(STORAGE_KEY, '/terms');
    const { result } = renderHook(() => useLastInfoPath('/clubs'));
    expect(result.current).toBe('/terms');
  });

  it('pathname 이 바뀌면 저장값을 다시 읽는다 (root layout 상주 컴포넌트 대응)', () => {
    const { result, rerender } = renderHook(({ pathname }) => useLastInfoPath(pathname), {
      initialProps: { pathname: '/clubs' },
    });
    expect(result.current).toBe('/notices');

    window.localStorage.setItem(STORAGE_KEY, '/faq');
    rerender({ pathname: '/faq' });
    expect(result.current).toBe('/faq');
  });
});
